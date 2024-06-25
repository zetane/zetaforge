import bodyParser from "body-parser";
import { spawn, exec } from "child_process";
import compression from "compression";
import cors from "cors";
import 'dotenv/config';
import { app as electronApp } from 'electron';
import express from "express";
import fs, { readFileSync } from "fs";
import multer from "multer";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import { BLOCK_SPECS_FILE_NAME } from "../src/utils/constants";
import axios from "axios"

let anvilProcess = null


function gracefullyStopAnvil() {
  if(anvilProcess !== null) {
    anvilProcess.kill("SIGINT")
    const sleep = new Promise(((resolve) => setTimeout(resolve, 5000)))
    sleep().then(res => {

    })
  }
}



function startExpressServer() {
  const app = express();
  const port = 3330;
  
  app.use(cors({
    origin: '*'
  }))
  app.use(compression());
  const anvilTimeoutPromise = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error("Anvil Timeout Error"))
    }, 3 * 60 * 1000)
  })
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

  app.get("/get-kube-contexts", async (req, res) => {
    async function getKubectlContexts() {
      return new Promise((resolve, reject) => {
        exec('kubectl config get-contexts -o name', (error, stdout, stderr) => {
          if (error) {
            return reject(`Error executing kubectl command: ${error.message}`);
          }
          if (stderr) {
            return reject(`Error in kubectl command output: ${stderr}`);
          }
          // Split the output into an array of contexts
          const contexts = stdout.trim().split('\n');
          resolve(contexts);
        });
      });
    }
    try {
      const contexts = await getKubectlContexts()
      res.status(200).json(contexts)
    } catch(err) {
      console.log(err)
      res.sendStatus(500)
    }
  })

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
  

  


  app.post("/initial-anvil-launch", (req, res) => {
    console.log("INITIAL LAUNCH")
    if(!electronApp.isPackaged) {
      res.sendStatus(200)
    }
    const anvilDir = path.join(process.resourcesPath, 'server2')
    try{
      const anvilFiles = fs.readdirSync(anvilDir)
      if(!anvilFiles.includes('config.json')) {
        console.log("CONFIG NOT FOUND")
        res.status(500).send({error: "CONFIG NOT FOUND"})
      } else {
        console.log("CONFIG FOUND")
        const configFile = path.join(anvilDir, 'config.json')
        const configBuffer = fs.readFileSync(configFile)
        const config = JSON.parse(configBuffer)
        if(config.IsLocal !== true){
          res.status(500).send({err: "Malformed config.json", kubeErr: "Local must be true"})
        }
        if(config.Local.Driver === 'minikube') {
          console.log("DRIVER IS MINIKUBE#######")
          const kubeConfig = ['config', 'use-context', 'zetaforge']
          const kubeExec = spawn('kubectl', kubeConfig)
          kubeExec.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`)
            res.status(500).send({err: "CAN'T SET KUBECONTEXT", kubeErr: data.toString()})
          })

          const anvilExec = anvilFiles.filter((file) => file.startsWith('s2-'))[0]
          const runAnvil = new Promise((resolve, reject) => {
            anvilProcess = spawn(path.join(anvilDir, anvilExec), {
              cwd: anvilDir,
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, use pipes for stdout and stderr
            });
      
            anvilProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
                
                if(data.toString().includes('[GIN-debug] [WARNING] Creating an Engine instance with the Logger and Recovery middleware already attached.')){
                  console.log("ANVIL RUN SUCCESFULLY")
                  resolve()
                }
              });
                
            anvilProcess.stderr.on('data', (data) => {
                console.log(`stderr: ${data}`);
                if(data.toString().includes("Failed to fetch kubernetes resources;" || data.toString().includes("Failed to get client config;"))) {
                  reject(new Error(`Kubeservices not found: ${data.toString()}`))
                }
              });
                
            anvilProcess.on('close', (code) => {});

          })
          console.log("CHECK RES2")
          console.log(res)

          const runAnvilPromise = Promise.race([anvilTimeoutPromise, runAnvil])

          runAnvilPromise.then((response) => {
            res.sendStatus(200)
          }).catch(err => {
            res.status(500).send({err: "Error while launching anvil" , kubeErr: err.message})
          })
        } else {
          console.log("CHECK KUBECONFIG")
          console.log(config.KubeContext)
          const kubeConfig = ['config', 'use-context', config.KubeContext]
          const kubeExec = spawn('kubectl', kubeConfig)
          kubeExec.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`)
            res.status(500).send({err: "CAN'T SET KUBECONTEXT", kubeErr: data.toString()})
          })
          const anvilExec = anvilFiles.filter((file) => file.startsWith('s2-'))[0]
          const runAnvil = new Promise((resolve, reject) => {
            anvilProcess = spawn(path.join(anvilDir, anvilExec), {
              cwd: anvilDir,
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, use pipes for stdout and stderr
            });
      
            anvilProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
                
                if(data.toString().includes('[GIN-debug] [WARNING] Creating an Engine instance with the Logger and Recovery middleware already attached.')){
                  console.log("ANVIL RUN SUCCESFULLY")
                  resolve()
                }
              });
                
            anvilProcess.stderr.on('data', (data) => {
                console.log(`stderr: ${data}`);
                if(data.toString().includes("Failed to fetch kubernetes resources;"|| data.toString().includes("Failed to get client config;"))) {
                  reject(new Error(`Kubeservices not found: ${data.toString()}`))
                }
              });
                
            anvilProcess.on('close', (code) => {});

          })
          console.log("CHECK RES2")
          console.log(res)

          const runAnvilPromise = Promise.race([anvilTimeoutPromise, runAnvil])

          runAnvilPromise.then((response) => {
            res.sendStatus(200)
          }).catch(err => {
            res.status(500).send({err: "Error while launching anvil" , kubeErr: err.message})
          })

        }


      }
    } catch(err) {
      res.sendStatus(500)
    }
  })


  app.post("/create-anvil-config", (req, res) => {
    console.log("CREATING ANVIL CONFIG")
    const body = req.body
    const config = {
      IsLocal: true,
      IsDev: true? process.env.VITE_ZETAFORGE_IS_DEV === 'True': false ,
      ServerPort: parseInt(body.anvilPort),
      KanikoImage: "gcr.io/kaniko-project/executor:latest",
      WorkDir: "/app",
      FileDir: "/files",
      ComputationFile: "computations.py",
      EntrypointFile: "entrypoint.py",
      ServiceAccount: "executor",
      Bucket: "forge-bucket",
      Database: "./zetaforge.db",
      KubeContext: body.KubeContext,
      SetupVersion: "1",
      Local: {
        BucketPort: parseInt(body.s3Port),
        Driver: body.KubeContext
      }      
    }
    const anvilDir = path.join(process.resourcesPath, 'server2')
    const configDir = path.join(anvilDir, 'config.json')
    const configStr = JSON.stringify(config)
    try{
      fs.writeFileSync(configDir, configStr)
      console.log("FILE WRITTEN")
    } catch(err) {
      console.log("ERROR HAPPEND WHILE WRITING CONFIG.JS")
      console.log(err)
    }
    const kubectl = ['config', 'use-context', body.KubeContext]
    const kubectlCmd = spawn('kubectl', kubectl)
    kubectlCmd.on('error', (data) => {
      console.log(data)
      return res.status(500).send({err: "CAN'T SET KUBECONTEXT", kubeErr: data.toString()})
    })

    res.sendStatus(200)



  })
  
  app.get("/isPackaged", (req, res) => {
    return res.status(200).json(electronApp.isPackaged)
  })
  app.post("/launch-anvil", async (req,res) => {
    if(!electronApp.isPackaged) {
      res.sendStatus(200)
    }
    const anvilDir = path.join(process.resourcesPath, 'server2')
    if(anvilProcess !== null) {
      anvilProcess.kill()
    }
    const body = req.body

    
    const anvilFiles = fs.readdirSync(anvilDir)
    if(!anvilFiles.includes('config.json')) {
      console.log("CHECK DEV")
      console.log(process.env.VITE_ZETAFORGE_IS_DEV)
      const config = {
        IsLocal: true,
        IsDev: true? process.env.VITE_ZETAFORGE_IS_DEV === 'True': false,
        ServerPort: parseInt(body.anvilPort),
        KanikoImage: "gcr.io/kaniko-project/executor:latest",
        WorkDir: "/app",
        FileDir: "/files",
        ComputationFile: "computations.py",
        EntrypointFile: "entrypoint.py",
        ServiceAccount: "executor",
        Bucket: "forge-bucket",
        Database: "./zetaforge.db",
        KubeContext: body.KubeContext,
        SetupVersion: "1",
        Local: {
          BucketPort: parseInt(body.s3Port),
          Driver: body.KubeContext
        }      
      }

      const configDir = path.join(anvilDir, 'config.json')
      const configStr = JSON.stringify(config)
      try{
        fs.writeFileSync(configDir, configStr)
        console.log("FILE WRITTEN")
      } catch(err) {
        console.log("ERROR HAPPEND WHILE WRITING CONFIG.JS")
        res.status(500).status({err: "Config error happened", kubeErr: "Error creating config error"})

        console.log(err)
      }

    } else {
      console.log("EXCEPTION HAPPEN HERE")
      //this else is added for minikube case.
      const configDir = path.join(anvilDir, 'config.json')
      const configFile = fs.readFileSync(configDir)
      const config = JSON.parse(configFile)
      config.KubeContext = body.KubeContext
      if(config.Local.Driver !== 'minikube') {
        config.Local.Driver = config.KubeContext
      } else {
        config.Local.Driver = 'minikube'
      }

      const configStr = JSON.stringify(config)
      try {
        fs.writeFileSync(configDir, configStr)
      } catch(err) {
        res.status(500).status({err: "Config error happened", kubeErr: "Error creating config error"})
      }

    }

     const configDir = path.join(anvilDir, 'config.json')
     const configBuffer = fs.readFileSync(configDir)
     const config = JSON.parse(configBuffer)
     if(config.Local.Driver === 'minikube') {
      console.log("DRIVER IS MINIKUBE111")
      const kubectl = ['config', 'use-context', 'zetaforge']
      const kubectlCmd = spawn('kubectl', kubectl)
      kubectlCmd.on('error', (data) => {
        console.log(data)
        return res.status(500).send({err: "CAN'T SET KUBECONTEXT", kubeErr: data.toString()})
      })
     } else {
      console.log("CHECK HERE")
      console.log(config.KubeContext)
      const KubeContext = config.KubeContext
      const kubectl = ['config', 'use-context', KubeContext]
      const kubectlCmd = spawn('kubectl', kubectl)
      kubectlCmd.on('error', (data) => {
        console.log(data)
        res.status(500).send({err: "CAN'T SET KUBECONTEXT", kubeErr: data.toString()})
      })
     }
     const anvilDirContent = fs.readdirSync(anvilDir)
     const anvilExec = anvilDirContent.filter((file) => file.startsWith('s2-'))[0]
     console.log("STARTING LAUNCH ANVIL...")
     const runAnvil = new Promise((resolve, reject) => {
        anvilProcess = spawn(path.join(anvilDir, anvilExec), {
          cwd: anvilDir,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, use pipes for stdout and stderr
        });
  
        anvilProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            
            if(data.toString().includes('[GIN-debug] [WARNING] Creating an Engine instance with the Logger and Recovery middleware already attached.')){
              console.log("ANVIL RUN SUCCESFULLY")
              resolve()
            }
          });
            
        anvilProcess.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`);
            if(data.toString().includes("Failed to fetch kubernetes resources;"|| data.toString().includes("Failed to get client config;"))){
              reject(new Error(`Kubeservices not found: ${data.toString()}`))
            }
          });
            
        anvilProcess.on('close', (code) => {});

      })
      const runAnvilPromise = Promise.race([anvilTimeoutPromise, runAnvil])

      runAnvilPromise.then((response) => {
        console.log("LAUNCH SUCCESFULL HAS TO RETURN")
        res.sendStatus(200)
      }).catch(err => {
        res.status(500).send({err: "Error while launching anvil" , kubeErr: err.message})
      })




 

})

  app.get("/ping-anvil", (req, res) => {
    fetch("http://127.0.0.1:8080/ping").then( (response) => {
      console.log("PING ANVIL")
      res.sendStatus(200)
    }
    ).catch((err) => {
      console.log(err)
      res.sendStatus(500)
    })
  })

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

  process.on('SIGINT', () => {
    console.log("SIGINT ANVIL")
    if(anvilProcess !== null) {
      console.log("KILLING ANVIL...")
      anvilProcess.kill('SIGINT')
    }
  })

  process.on('SIGTERM', () => {
    console.log("SIGINT ANVIL")
    if(anvilProcess !== null) {
      console.log("KILLING ANVIL...")
      anvilProcess.kill("SIGINT")
    }

  })
}

export { startExpressServer, gracefullyStopAnvil };
