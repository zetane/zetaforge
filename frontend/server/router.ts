import { app, dialog } from 'electron';
import fs from "fs/promises";
import path from "path";
import { z } from 'zod';
import { compileComputation, runTest, saveBlockSpecs } from './blockSerialization.js';
import { getHistory, getIndex, updateHistory, updateIndex } from "./chat";
import { readPipelines, readSpecs } from "./fileSystem.js";
import { copyPipeline, executePipeline, getBlockPath, removeBlock, saveBlock, saveSpec } from './pipelineSerialization.js';
import { publicProcedure, router } from './trpc';
import { errorHandling } from "./middleware"
import { logger } from "./logger.js";

export const appRouter = router({
  getBlocks: publicProcedure
    .use(errorHandling)
    .query(async () => {
      const resources = process.resourcesPath
      let coreBlocks = "core/blocks"
      if (app.isPackaged) {
        coreBlocks = path.join(resources, "core", "blocks")
      }

        const blocks = await readSpecs(coreBlocks)
        return blocks
    }),
  getBlockCoverImagePath: publicProcedure
    .use(errorHandling)
    .input(z.object({
      blockId: z.string(),
    }))
    .query(async (opts) => {
      const { input } = opts;
      const { blockId } = input;
      const resources = process.resourcesPath;
      let blocksPath = "core/blocks";
      if (app.isPackaged) {
        blocksPath = path.join(resources, "core", "blocks");
      }

      try {
        const coverImagePath = path.join(blocksPath, blockId, "cover-image.png");
        return { coverImagePath };
      } catch (error) {
        logger.error(error);
        return { coverImagePath: null };
      }
    }),
  getPipelines: publicProcedure
    .use(errorHandling)
    .query(async () => {
      const resources = process.resourcesPath;
      let corePipelines = "core/pipelines";
      if (app.isPackaged) {
        corePipelines = path.join(resources, "core", "pipelines");
      }

      try {
        const pipelines = await readPipelines(corePipelines);
        return pipelines;
      } catch (error) {
        logger.error(error);
        return [];
      }
    }),
  getPipelineCoverImagePath: publicProcedure
    .use(errorHandling)
    .input(z.object({
      pipelineId: z.string(),
    }))
    .query(async (opts) => {
      const { input } = opts;
      const { pipelineId } = input;
      const resources = process.resourcesPath;
      let pipelinesPath = "core/pipelines";
      if (app.isPackaged) {
        pipelinesPath = path.join(resources, "core", "pipelines");
      }

      try {
        const pipelines = await readPipelines(pipelinesPath);
        const pipeline = pipelines.find(p => p.id === pipelineId);
        if (!pipeline) {
          throw new Error(`Pipeline with ID ${pipelineId} not found`);
        }
        const coverImagePath = path.join(pipelinesPath, pipeline.folderName, 'cover-image.png');
        return { coverImagePath };
      } catch (error) {
        logger.error(error);
        return { coverImagePath: null };
      }
    }),
  //TODO: load and validate schema
  savePipeline: publicProcedure
    .use(errorHandling)
    .input(z.object({
      specs: z.any(),
      name: z.optional(z.string()),
      buffer: z.string(),
      writePath: z.optional(z.string())
    }))
    .mutation(async (opts) => {
      const { input } = opts
      let { specs, name, buffer, writePath } = input
      if (!writePath) {
        const savePath = await dialog.showSaveDialog({ properties: ['createDirectory'] })
        if (!savePath.canceled) {
          const pathArr = savePath.filePath?.split(path.sep)
          name = pathArr ? pathArr[(pathArr.length - 1)] : name
          writePath = savePath.filePath
          specs['sink'] = writePath
          specs['build'] = writePath
          specs['name'] = name

          if (writePath) {
            try {
              const stat = await fs.stat(writePath)
              if (stat.isDirectory()) {
                fs.rm(writePath, { recursive: true, force: true })
              }
            } catch {
              logger.debug("Creating dir: ", writePath)
            }
          }
        }
      }

      if (writePath) {
        const savePaths = await copyPipeline(specs, buffer, writePath);
        return { name: name, ...savePaths };
      }

      return {}
    }),
  saveBlock: publicProcedure
    .use(errorHandling)
    .input(z.object({
      pipelineSpec: z.any(),
      blockSpec: z.any(),
      blockId: z.string(),
      blockPath: z.string(),
      pipelinePath: z.string()
    }))
    .mutation(async(opts) => {
      const {input} = opts;
      const {pipelineSpec, blockSpec, blockId, blockPath, pipelinePath} = input;
      let savePaths;
      if (blockSpec.action?.container) {
        savePaths = await saveBlock(blockId, blockSpec, blockPath, pipelinePath);
        await saveSpec(pipelineSpec, pipelinePath)
      } else if (blockSpec.action?.parameters) {
        savePaths = await saveSpec(pipelineSpec, pipelinePath)
      }
      return savePaths;
    }),
  getBlockPath: publicProcedure
    .use(errorHandling)
    .input(z.object({
      blockId: z.string(),
      pipelinePath: z.string(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockId, pipelinePath } = input;
      return await getBlockPath(blockId, pipelinePath);
    }),
  getCachePath: publicProcedure
    .use(errorHandling)
    .query(async () => {
      return path.join(process.cwd(), ".cache") + path.sep
    }),
  removeBlock: publicProcedure
    .use(errorHandling)
    .input(z.object({
      blockId: z.string(),
      pipelinePath: z.string(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockId, pipelinePath } = input;
      removeBlock(blockId, pipelinePath);
    }),
  executePipeline: publicProcedure
    .use(errorHandling)
    .input(z.object({
      id: z.string(),
      executionId: z.string(),
      specs: z.any(),
      path: z.string().optional(),
      buffer: z.string(),
      name: z.string(),
      rebuild: z.boolean(),
      anvilConfiguration: z.object({
        name: z.string(),
        anvil: z.object({
          host: z.string(),
          port: z.string(),
        }),
        s3: z.object({
          host: z.string(),
          port: z.string(),
          region: z.string(),
          bucket: z.string(),
          accessKeyId: z.string(),
          secretAccessKey: z.string(),
        }),
      })
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { id, executionId, specs, path, buffer, name, rebuild, anvilConfiguration } = input;

      return await executePipeline(id, executionId, specs, path, buffer, name, rebuild, anvilConfiguration);
    }),
  compileComputation: publicProcedure
    .use(errorHandling)
    .input(z.object({
      blockPath: z.string(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockPath } = input;

      return await compileComputation(blockPath);
    }),
  saveBlockSpecs: publicProcedure
    .use(errorHandling)
    .input(z.object({
      blockPath: z.string(),
      blockSpecs: z.any(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockPath, blockSpecs } = input;

      return await saveBlockSpecs(blockPath, blockSpecs);
    }),
  runTest: publicProcedure
    .use(errorHandling)
    .input(z.object({
      blockPath: z.string(),
      blockKey: z.string(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockPath, blockKey } = input;

      await runTest(blockPath, blockKey);
    }),
  chat: router({
    history: router({
      get: publicProcedure
      .use(errorHandling)
      .input(z.object({
        blockPath: z.string()
      }))
      .query(async (opts) => {
        const { input } = opts;
        const { blockPath } = input;

        const chatHistory = await getHistory(blockPath);
        return chatHistory;
      }),
      update: publicProcedure
      .use(errorHandling)
      .input(z.object({
        blockPath: z.string(),
        history: z.array(z.any()),
      }))
      .mutation(async (opts) => {
        const { input } = opts;
        const { blockPath, history } = input;

        await  updateHistory(blockPath, history);
      }),
    }),
    index: router({
      get: publicProcedure
      .use(errorHandling)
      .input(z.object({
        blockPath: z.string()
      }))
      .query(async (opts) => {
        const { input } = opts;
        const { blockPath } = input;

        const chatIndex = await getIndex(blockPath);
        return chatIndex;
      }),
      update: publicProcedure
      .use(errorHandling)
      .input(z.object({
        blockPath: z.string(),
        index: z.number(),
      }))
      .mutation(async (opts) => {
        const { input } = opts;
        const { blockPath, index } = input;

        await updateIndex(blockPath, index);
      }),
    }),
  })
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
