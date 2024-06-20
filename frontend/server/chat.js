import fs from "fs/promises";
import path from "path";
import { fileExists, readJsonToObject } from "./fileSystem";
import z from "zod"

const CHAT_HISTORY_FILE_NAME = "chatHistory.json";
const COMPUTATIONS_FILE_NAME = "computations.py";
const START_PROMPT = "Code Template";

const schema = z.object({
  index: z.number(),
  history: z.array(
    z.object({
      timestamp: z.number(),
      prompt: z.string(),
      response: z.string(),
    })
  )
})

const legacySchema = z.array(
  z.object({
    timestamp: z.number(),
    prompt: z.string(),
    response: z.string(),
  })
)


export async function getHistory(blockPath) {
  const chat = await getChat(blockPath);
  return chat.history
}

export async function updateHistory(blockPath, newHistory) {
  const chatPath = path.join(blockPath, CHAT_HISTORY_FILE_NAME);
  const chat = await getChat(blockPath);
  chat.history = newHistory
  await fs.writeFile(chatPath, JSON.stringify(chat, null, 2));
}

export async function getIndex(blockPath) {
  const chat = await getChat(blockPath);
  return chat.index
}

export async function updateIndex(blockPath, newIndex) {
  const chatPath = path.join(blockPath, CHAT_HISTORY_FILE_NAME);
  const chat = await getChat(blockPath);
  chat.index = newIndex
  await fs.writeFile(chatPath, JSON.stringify(chat, null, 2));
}

async function getChat(blockPath) {
  const chatPath = path.join(blockPath, CHAT_HISTORY_FILE_NAME);

  if (!(await fileExists(chatPath))) {
    const chat = await createDefaultChat(blockPath);
    await fs.writeFile(chatPath, JSON.stringify(chat, null, 2));
    return chat
  }
  
  let fileContent;
  try {
    fileContent = await readJsonToObject(chatPath);
  } catch {
    const chat = await createDefaultChat(blockPath);
    await fs.writeFile(chatPath, JSON.stringify(chat, null, 2));
    return chat
  }

  const result = schema.safeParse(fileContent)
  if(!result.success) {
    const chat = await handleInvalidSchema(fileContent, blockPath);
    await fs.writeFile(chatPath, JSON.stringify(chat, null, 2));
    return chat;
  }

  return result.data
}

async function handleInvalidSchema(fileContent, blockPath) {
  const result = legacySchema.safeParse(fileContent)
  if (result.success) {
    return await upgradeChatHistory(fileContent, blockPath)
  } 
  
  return await createDefaultChat(blockPath)
}

async function createDefaultChat(blockPath) {
  const codeTemplatePath = path.join(blockPath, COMPUTATIONS_FILE_NAME);
  const codeTemplate = await fs.readFile(codeTemplatePath, "utf8");
  const chatHistory = {
    index: 0,
    history: [{
      timestamp: Date.now(),
      prompt: START_PROMPT,
      response: codeTemplate,
  }]};
  return chatHistory; 
}

async function upgradeChatHistory(history, blockPath) {
  const codeTemplatePath = path.join(blockPath, COMPUTATIONS_FILE_NAME);
  const currentCode = await fs.readFile(codeTemplatePath, "utf8");

  let codeIndex = -1
  for (let [index, value] of history.entries()) {
    if (value.response == currentCode) {
      codeIndex = index
    }
  }

  if (codeIndex === -1) {
    history = [
      ...history,
      {
        timestamp: Date.now(),
        prompt: START_PROMPT,
        response: currentCode,
      }
    ]
    codeIndex = history.length - 1
  }


  const chatHistory = {
    index: codeIndex,
    history: history 
  };
  return chatHistory; 
}

