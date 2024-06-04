import { SPECS_FILE_NAME } from "../src/utils/constants";
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from "fs/promises";
import { tmpdir } from "os";
import path from "path";

//fix for specs.json issue
const coreBlockDir = 'core/blocks'; 

// Function to copy specs_v1.json to specs.json if specs.json doesn't exist
export const copySpecsIfNotExists = async (dir) => {
  const specsV1Path = path.join(dir, 'specs_v1.json');
  const specsPath = path.join(dir, 'specs.json');
  
  if (await fileExists(specsV1Path) && !(await fileExists(specsPath))) {
    const specsV1Data = await fs.readFile(specsV1Path, 'utf8');
    await fs.writeFile(specsPath, specsV1Data);
    console.log(`Replicated contents in ${specsV1Path} to ${specsPath}`);
  } else {
    console.log(`specs.json already exists in ${dir}`); //logs if specs.json already exists or specs_v1.json does not exist
  }
}

// Function to process all processing blocks in the core block directory
const processCoreBlockDirectory = async (coreBlockDir) => {
  try {
    const processingBlocks = await fs.readdir(coreBlockDir);
    for (const block of processingBlocks) {
      const blockPath = path.join(coreBlockDir, block);
      const stat = await fs.stat(blockPath);
      if (stat.isDirectory()) {
        await copySpecsIfNotExists(blockPath);
      }
    }
  } catch (error) {
    console.error("Error processing core block directory:", error);
  }
}

//call function to process core block directory
processCoreBlockDirectory(coreBlockDir);

// TODO: use env vars
export const s3Upload = async (filePath) => {
  if (await fileExists(filePath)) {
    const fileName = filePath.split(path.sep).at(-1)
    const uploadKey = `files/${fileName}`
    const fileBody = await fs.readFile(filePath)
    const creds = {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    }

    // note: using `localhost` in the endpoint caused a connection refused error
    // because the s3client defaults to using ipv6
    const client = new S3Client({
      region: 'us-east-2',
      credentials: creds,
      endpoint: "http://127.0.0.1:8333",
      forcePathStyle: true,
    })
    const res = await client.send(new PutObjectCommand({
      Bucket: "zetaforge",
      Key: uploadKey,
      Body: fileBody,
      Metadata: {
        name: fileName,
      }
    }))
    return res
  }
}

export const readPipelines = async (dir) => {
  const items = await fs.readdir(dir);
  return pipelineSpecBuilder(items, dir);
}

const pipelineSpecBuilder = async (items, dir) => {
  const pipelinesData = [];

  for (const item of items) {
    try {
      const itemPath = path.join(dir, item);
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        const pipelineSpecFile = path.join(itemPath, `${item}.json`);
        try {
          await fs.stat(pipelineSpecFile);
          const pipelineData = await fs.readFile(pipelineSpecFile, 'utf8');
          const parsedPipelineData = JSON.parse(pipelineData);
          parsedPipelineData.folderName = item; // Add the folder name to the pipeline data
          pipelinesData.push(parsedPipelineData);
        } catch (error) {
          console.log("ERROR: ", error);
        }
      }
    } catch (error) {
      console.log("ERROR: ", error);
    }
  }

  return pipelinesData;
}

export const readSpecs = async (dir) => {
  const items = await fs.readdir(dir);
  //const pipelines = await fs.readdir("../pipelines");
  return specBuilder(items, dir);
}

const specBuilder = async (specs, dir) => {
  const specsData = [];

  for (const item of specs) {
    try {
      const itemPath = path.join(dir, item)
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        const specs = path.join(itemPath, SPECS_FILE_NAME);
        try {
          await fs.stat(specs)
          const specData = await fs.readFile(specs)
          specsData.push(JSON.parse(specData))
        } catch (error) {
          console.log("ERROR: ", error)
        }
      }

    } catch (error) {
        console.log("ERRRRRROR: ", error)
      }

    }

    return specsData;
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonToObject(filePath) {
  const buffer = await fs.readFile(filePath);
  return JSON.parse(buffer);
}

export async function filterDirectories(filePaths) {
  const stats = await Promise.all(filePaths.map((p) => fs.stat(p)));
  return filePaths
    .map((p, i) => [p, stats[i]])
    .filter(([p, s]) => s.isDirectory())
    .map(([p, s]) => p);
}

export async function withFileSystemRollback(restorablePaths, workFunction) {
  const tempDirectory = await fs.mkdtemp(path.join(tmpdir(), "rollback"));
  const existingFiles = [];
  const notExistingFiles = [];

  try {
    for (const p of restorablePaths) {
      if (await fileExists(p)) {
        await fs.cp(p, path.join(tempDirectory, btoa(p)), { recursive: true });
        existingFiles.push(p);
      } else {
        notExistingFiles.push(p);
      }
    }

    await workFunction();
  } catch (e) {
    console.error(
      "File system operations failed. Starting file rollback. Caused by:",
      e
    );
    for (const p of existingFiles) {
      await fs.rm(p, { recursive: true });
      await fs.cp(path.join(tempDirectory, btoa(p)), p, { recursive: true });
    }
    for (const p of notExistingFiles) {
      await fs.rm(p, { recursive: true });
    }
  } finally {
    await fs.rm(tempDirectory, { recursive: true });
  }
}
