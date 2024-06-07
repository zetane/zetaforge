import bodyParser from "body-parser";
import { spawn } from "child_process";
import compression from "compression";
import cors from "cors";
import 'dotenv/config';
import { app as electronApp } from 'electron';
import express from "express";
import fs, { readFileSync } from "fs";
import multer from "multer";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import sha256 from 'sha256';
import { BLOCK_SPECS_FILE_NAME } from "../src/utils/constants";
import { fileExists, readJsonToObject, readSpecs } from "./fileSystem.js";
import { copyPipeline, saveBlock } from "./pipelineSerialization.js";


function startExpressServer() {
  const app = express();
  const port = 3330;

  app.use(cors())
  app.use(compression());

  // http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
  app.disable("x-powered-by");
  //app.use(express.static(path.join(__dirname, '..', '..', 'backup_frontend')));
  //app.use('/blocks', express.static(path.join(__dirname, '..', '..', 'blocks')));
  //app.use('/my_data', express.static(path.join(__dirname, '..', '..', 'my_data')));
  //app.use('/history', express.static(path.join(__dirname, '..', '..', 'history')));
  //app.use('/my_blocks', express.static(path.join(__dirname, '..', '..', 'my_blocks')));
  // handle asset requests

  // Everything else (like favicon.ico) is cached for an hour. You may want to be
  // more aggressive with this caching.
  app.use(express.json());
  app.use(express.static('public'));
  app.use(bodyParser.json());

  // OpenAI
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  const upload = multer({ dest: "_temp_import" });

  function getActiveRun() {
      try {
          // Read the JSON file synchronously
          const data = readFileSync(path.join(__dirname, '..', '..', 'history', 'active_run.json'), 'utf8');
          
          // Parse the JSON content
          const parsedData = JSON.parse(data);

          return parsedData;
      } catch (err) {
          // console.error("Error reading or parsing the JSON file:", err);
          return null;
      }
  }

  app.post("/import-files", upload.array("files"), (req, res) => {
    const files = req.files;

    files.forEach((file) => {
      const targetPath = path.join(req.body.blockPath, file.originalname);

      // Move file from temporary location to target directory
      fs.renameSync(file.path, targetPath);
    });

    res.send("Files imported successfully");
  });

  app.post("/import-folder", upload.array("files"), (req, res) => {
    const files = req.files;
    const paths = req.body.paths;

    if (!Array.isArray(paths) || paths.length !== files.length) {
      return res.status(400).send("Mismatch between files and paths data.");
    }

    files.forEach((file, index) => {
      const relativePath = paths[index];
      const targetPath = path.join(req.body.blockPath, relativePath);
      const directory = path.dirname(targetPath);

      // Create directory if it doesn't exist, including any nested subdirectories
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      // Move file from temporary location to target directory
      fs.renameSync(file.path, targetPath);
    });

    res.send("Folder imported successfully");
  });


  app.post("/save-file", (req, res) => {
    const { pipelinePath, filePath, content } = req.body;
    const pipelineFilePath = path.join(pipelinePath, filePath);

    fs.writeFile(pipelineFilePath, content, (err) => {
      if (err) {
        console.error("Error writing data to file:", err);
        res.status(500).send({ error: "Error writing data to file" });
        return;
      }
      res.send({ log: `Saved file at ${filePath}` });
    });
  });

  app.post("/get-agent", async (req, res) => {
    const { blockPath } = req.body;
    const specsPath = path.join(blockPath, BLOCK_SPECS_FILE_NAME)
    
    fs.readFile(specsPath, (err, data) => {
      if (err) {
        console.error(`Error sending the file: ${err}`);
        res.status(500).json({ error: "Could not retrieve agent" });
        return;
      }

      const specs = JSON.parse(data);
      if (specs.information.block_type == "view") {
        res.status(200).json("gpt-4_python_view");
      } else {
        res.status(200).json("gpt-4_python_compute");
      }
    });
  });

  app.post("/api/call-agent", async (req, res) => {
    const { userMessage, agentName, conversationHistory, apiKey} = req.body
    console.log("USER MESSAGE", userMessage);
  
    try {
      // Path to the Python script
      let agents = "agents"
      if(electronApp.isPackaged) {
        agents = path.join(process.resourcesPath, "agents")
      }
      const scriptPath = path.join(agents, agentName, "generate", "computations.py")
      const pythonProcess = spawn("python", [scriptPath]);

      const inputData = { apiKey, userMessage, conversationHistory };
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();

      // Collect data from the Python script
      let scriptOutput = "";
      pythonProcess.stdout.on("data", (data) => {
        scriptOutput += data.toString();
      });

      pythonProcess.stdout.on("end", () => {
        console.log("Received from Python script:", scriptOutput);
        try {
          res.send(JSON.parse(scriptOutput));
        } catch (parseError) {
          console.error("Error parsing script output:", parseError);
          res.status(500).send({ error: "Error parsing script output" });
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          console.log(`Python script exited with code ${code}`);
          res.status(500).send({ error: "Python script error" });
        }
      });
    } catch (err) {
      console.error("Server error:", err);
      res.status(500).send({ error: "Internal server error" });
    }
  });

  app.post("/get-directory-tree", (req, res) => {
    const blockFolder = req.body.folder;
    try {
      const fileSystem = getFileSystemContent(blockFolder);
      res.json(fileSystem);
    } catch (err) {
      console.error("Error reading directory:", err);
      res.status(500).send({ error: "Error reading directory" });
    }
  });

  const getFileSystemContent = (dirPath) => {
    const fileSystem = {};

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isDirectory()) {
        // If the entry is a directory, recurse into it
        fileSystem[entry.name] = {
          type: "folder",
          expanded: false,
          content: getFileSystemContent(path.join(dirPath, entry.name)), // Recursive call
        };
      } else {
        // Determine the file extension
        const ext = path.extname(entry.name).toLowerCase();
        // Read content if the file has one of the specified extensions
        let fileContent = `This file type is not supported for display.\n`; // Default placeholder content
        if (
          [
            ".json",
            ".py",
            ".txt",
            ".html",
            ".gitkeep",
            ".md",
            ".yaml",
            ".bat",
          ].includes(ext) ||
          entry.name == "Dockerfile" ||
          entry.name == "LICENSE"
        ) {
          const fullPath = path.join(dirPath, entry.name);
          try {
            fileContent = fs.readFileSync(fullPath, "utf8");
          } catch (error) {
            console.error(`Error reading file ${entry.name}:`, error);
            fileContent = `Error reading file ${entry.name}`;
          }
        }

        // Store file information
        fileSystem[entry.name] = {
          type: "file",
          content: fileContent,
        };
      }
    });

    return fileSystem;
  };
  
  app.post("/launch-anvil-locally", (req, res) => {
    console.log("RECEIVED REQUEST")
    const config = req.body

    console.log(config)
  })

  app.post("/new-block-react", (req, res) => {
    const data = req.body;
    
    let folderPath = data.block_name;
    const filePath = path.join(data.blockPath, "computations.py");
  
    fs.writeFile(filePath, data.computations_script, (err) => {
      if (err) {
        console.error("Error writing data to file:", err);
        res.status(500).send({ error: "Error writing data to file" });
        return;
      }
      res.send({ log: "Saved compute file to " + folderPath });
    });
  });

  app.get("/api/logs", (req, res) => {
    const filePath = req.query.filePath;

    // Check if the file exists
    if (fs.existsSync(filePath)) {
      // File exists, read and return its content
      fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Error reading log file");
        }
        res.send(data);
      });
    } else {
      // File does not exist, send a default message or an empty string
      res.send("Logs not available yet");
    }
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

export { startExpressServer };

