import { HeadObjectCommand, PutObjectCommand, GetObjectCommand, CopyObjectCommand, S3Client } from "@aws-sdk/client-s3";
import config from "../../config";

function getClient(configuration) {
  const endpoint = `http://${configuration.host}:${configuration.s3Port}`;
  return new S3Client({
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey
    },
    endpoint: endpoint,
    forcePathStyle: config.s3.forcePathStyle,
  })
}

async function fileExists(key, anvilConfiguration) {
  const client = getClient(anvilConfiguration);

  try {
    await client.send(new HeadObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound') {
      return false;
    }
    const message = 'Error checking file existence in S3';
    console.error(message, err);
    throw new Error(message);
  }
}


export async function getFileData(key, anvilConfiguration) {
  const exists = await fileExists(key, anvilConfiguration);
  const client = getClient(anvilConfiguration)

  if (exists) {
    try {
      const response = await client.send(new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      }));

      const fileData = await response.Body.transformToString();
      return fileData;
    } catch (err) {
      const message = 'Could not retrieve file from S3';
      console.error(message, err);
      throw new Error(message);
    }
  } else {
    const message = `File with key ${key} does not exist in S3`
    throw new Error(message)
    return null;
  }
}
