import { TRPCError } from "@trpc/server";
import { app, dialog } from 'electron';
import fs from "fs/promises";
import path from "path";
import { z } from 'zod';
import { compileComputation, runTest, saveBlockSpecs } from './blockSerialization.js';
import { getHistory, getIndex, updateHistory, updateIndex } from "./chat.js";
import { readPipelines, readSpecs } from "./fileSystem.js";
import { copyPipeline, executePipeline, getBlockPath, removeBlock, saveBlock, saveSpec, uploadBlocks } from './pipelineSerialization.js';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  getBlocks: publicProcedure
    .query(async () => {
      const resources = process.resourcesPath
      let coreBlocks = "core/blocks"
      if (app.isPackaged) {
        coreBlocks = path.join(resources, "core", "blocks")
      }

      try {
        const blocks = await readSpecs(coreBlocks)
        return blocks
      } catch (error) {
        console.log(error)
      }
    }),
  getBlockCoverImagePath: publicProcedure
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
        console.log(error);
        return { coverImagePath: null };
      }
    }),
  getPipelines: publicProcedure
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
        console.log(error);
        return [];
      }
    }),
  getPipelineCoverImagePath: publicProcedure
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
        console.log(error);
        return { coverImagePath: null };
      }
    }),
  //TODO: load and validate schema
  savePipeline: publicProcedure
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
              console.log("Creating dir: ", writePath)
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
    .query(async () => {
      return path.join(process.cwd(), ".cache") + path.sep
    }),
  removeBlock: publicProcedure
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
        host: z.string(),
        s3Port: z.string(),
        anvilPort: z.string(),
      })
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { id, executionId, specs, path, buffer, name, rebuild, anvilConfiguration } = input;
      
      try {
        return await executePipeline(id, executionId, specs, path, buffer, name, rebuild, anvilConfiguration);
      } catch (error) {
        const message = "Could not execute the pipeline"
        console.error(message, error, error.stack)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: message,
        });
      }
    }),
  compileComputation: publicProcedure
    .input(z.object({
      blockPath: z.string(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockPath } = input;

      try {
        return await compileComputation(blockPath);
      } catch (error) {
        console.error(error)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not compile.',
        });
      }

    }),
  saveBlockSpecs: publicProcedure
    .input(z.object({
      blockPath: z.string(),
      blockSpecs: z.any(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockPath, blockSpecs } = input;

      try {
        return await saveBlockSpecs(blockPath, blockSpecs);
      } catch (error) {
        console.error(error)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not compile.',
        });
      }
    }),
  runTest: publicProcedure
    .input(z.object({
      blockPath: z.string(),
      blockKey: z.string(),
    }))
    .mutation(async (opts) => {
      const { input } = opts;
      const { blockPath, blockKey } = input;

      try {
        await runTest(blockPath, blockKey);
      } catch (error) {
        console.log(error);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not run test'
        })
      }
    }),
  chat: router({
    history: router({
      get: publicProcedure
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
