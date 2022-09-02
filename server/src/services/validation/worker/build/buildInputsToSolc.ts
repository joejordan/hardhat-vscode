/* eslint-disable @typescript-eslint/no-unused-vars */
import { analyze } from "@nomicfoundation/solidity-analyzer";
import { isDeepStrictEqual } from "util";
import type {
  CompilerInput,
  HardhatRuntimeEnvironment,
  SolcBuild,
} from "hardhat/types";

import { Parser } from "hardhat/internal/solidity/parse";

import { SolidityFilesCache as SolidityFilesCache2 } from "hardhat/builtin-tasks/utils/solidity-files-cache";
import { DependencyGraph } from "hardhat/internal/solidity/dependencyGraph";
import {
  WorkerState,
  BuildJob,
  ValidationCompleteMessage,
} from "../../../../types";
import { CustomResolver } from "./CustomResolver";

export interface SolcInput {
  built: true;
  jobId: number;
  solcVersion: string;
  input: CompilerInput;
  solcBuild: SolcBuild;
  sourcePaths: string[];
}

export async function buildInputsToSolc(
  workerState: WorkerState,
  buildJob: BuildJob
): Promise<{ built: false; result: ValidationCompleteMessage } | SolcInput> {
  const analysis = analyze(buildJob.documentText);

  if (
    workerState.previousChangedDocAnalysis !== undefined &&
    buildJob.uri === workerState.previousChangedDocAnalysis.uri &&
    isDeepStrictEqual(analysis, workerState.previousChangedDocAnalysis.analysis)
  ) {
    if (workerState.previousSolcInput !== undefined) {
      const { overwrite } = overwriteWithCurrentChanges(
        workerState.previousSolcInput,
        buildJob.uri,
        buildJob.documentText
      );

      if (!overwrite) {
        // log and continue
        workerState.logger.error(
          `Unable to overwrite changed doc at: ${buildJob.uri}`
        );
      } else {
        buildJob.preprocessingFinished = new Date();
        buildJob.fromInputCache = true;
        return workerState.previousSolcInput;
      }
    }
  } else {
    workerState.previousChangedDocAnalysis = { uri: buildJob.uri, analysis };
  }

  workerState.hre.tasks[
    workerState.tasks.TASK_COMPILE_SOLIDITY_READ_FILE
  ].setAction(
    async (
      args: { absolutePath: string },
      hre: HardhatRuntimeEnvironment,
      runSuper: () => {}
    ) => {
      const normalizedUri = args.absolutePath.replaceAll("\\", "/");

      const openDoc = buildJob.openDocuments.find(
        (doc) => doc.uri === normalizedUri
      );

      if (openDoc !== undefined) {
        return openDoc.documentText;
      }

      return workerState.originalReadFileAction(args, hre, runSuper);
    }
  );

  workerState.hre.tasks[
    workerState.tasks.TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH
  ].setAction(
    async (
      {
        sourceNames,
        solidityFilesCache,
      }: { sourceNames: string[]; solidityFilesCache?: SolidityFilesCache2 },
      hre: HardhatRuntimeEnvironment,
      runSuper: () => {}
    ) => {
      const parser = new Parser(solidityFilesCache);
      console.log("Solidity read file");

      const resolver = new CustomResolver(
        hre.config.paths.root,
        parser,
        (absolutePath: string) =>
          hre.run(workerState.tasks.TASK_COMPILE_SOLIDITY_READ_FILE, {
            absolutePath,
          }),
        workerState.remappings || []
      );

      const resolvedFiles = await Promise.all(
        sourceNames.map((sn) => resolver.resolveSourceName(sn))
      );
      console.log({ resolvedFiles });

      const dependencyGraph = await DependencyGraph.createFromResolvedFiles(
        resolver as any,
        resolvedFiles
      );

      return dependencyGraph;
    }
  );

  await getSourcePaths(workerState, buildJob);

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  await getSourceNames(workerState, buildJob);

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  await readFileCache(workerState, buildJob);

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  await getDependencyGraph(workerState, buildJob);

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  getValidationFile(workerState, buildJob);

  const result = await getCompilationJob(workerState, buildJob);

  if (result !== null) {
    return { built: false, result };
  }

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  await getSolcInput(workerState, buildJob);

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  const solcVersion = buildJob.context.compilationJob.getSolcConfig().version;

  await getSolcBuild(workerState, buildJob, solcVersion);

  if (isJobCancelled(buildJob)) {
    return cancel(buildJob);
  }

  buildJob.preprocessingFinished = new Date();

  const solcInput: SolcInput = {
    built: true,
    solcVersion,
    jobId: buildJob.jobId,
    input: buildJob.context.input,
    solcBuild: buildJob.context.solcBuild,
    sourcePaths: buildJob.context.sourcePaths ?? [],
  };

  workerState.previousSolcInput = solcInput;

  return solcInput;
}

function overwriteWithCurrentChanges(
  previous: SolcInput,
  changedUri: string,
  changedDocumentText: string
) {
  const normalizedChangedUri = changedUri.replaceAll("\\", "/");
  const changedDocKey = Object.keys(previous.input.sources).find((k) =>
    normalizedChangedUri.endsWith(k)
  );

  if (changedDocKey === undefined) {
    return { overwrite: false };
  }

  previous.input.sources[changedDocKey] = { content: changedDocumentText };

  return { overwrite: true };
}

// Gets the paths to the contract files for the project
async function getSourcePaths(
  { hre, tasks: { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } }: WorkerState,
  { context }: BuildJob
) {
  context.sourcePaths = await hre.run(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS);
}

// transform them into relative paths to the project base path
async function getSourceNames(
  { hre, tasks: { TASK_COMPILE_SOLIDITY_GET_SOURCE_NAMES } }: WorkerState,
  { context }: BuildJob
) {
  console.log("Get source names");

  context.sourceNames = await hre.run(
    TASK_COMPILE_SOLIDITY_GET_SOURCE_NAMES,
    context
  );
  console.log(`Result: ${context.sourceNames}`);
}

async function readFileCache(
  { SolidityFilesCache, solidityFilesCachePath }: WorkerState,
  { context }: BuildJob
) {
  context.solidityFilesCache = await SolidityFilesCache.readFromFile(
    solidityFilesCachePath
  );
}

async function getDependencyGraph(
  { hre, tasks: { TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH } }: WorkerState,
  { context }: BuildJob
) {
  console.log("Get dependency graph");

  context.dependencyGraph = await hre.run(
    TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH,
    context
  );
}

function getValidationFile(
  _workerState: WorkerState,
  { uri, context }: BuildJob
): void {
  context.file = context.dependencyGraph
    .getResolvedFiles()
    .filter(
      (f: { absolutePath: string }) =>
        f.absolutePath.replaceAll("\\", "/") === uri
    )[0];
}

async function getCompilationJob(
  {
    hre,
    tasks: { TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE },
    logger,
  }: WorkerState,
  { jobId, projectBasePath, context, startTime }: BuildJob
): Promise<ValidationCompleteMessage | null> {
  console.log("Get compilation job");
  console.log({ jobId, projectBasePath, context, startTime });

  context.compilationJob = await hre.run(
    TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE,
    {
      file: context.file,
      dependencyGraph: context.dependencyGraph,
      solidityFilesCache: context.solidityFilesCache,
    }
  );

  if (context.compilationJob.reason) {
    logger.trace(
      `[WORKER] Compilation job failed (${
        (new Date().getTime() - startTime.getTime()) / 1000
      }) - ${context.compilationJob.reason}`
    );

    return {
      type: "VALIDATION_COMPLETE",
      status: "JOB_COMPLETION_ERROR",
      jobId,
      projectBasePath,
      reason: context.compilationJob.reason,
    };
  }

  return null;
}

async function getSolcInput(
  { hre, tasks: { TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT } }: WorkerState,
  { uri, documentText, openDocuments, context }: BuildJob
): Promise<ValidationCompleteMessage | null> {
  const modifiedFiles = {
    [uri]: documentText,
  };

  for (const unsavedDocument of openDocuments) {
    modifiedFiles[unsavedDocument.uri] = unsavedDocument.documentText;
  }

  context.compilationJob
    .getResolvedFiles()
    .forEach(
      (file: { absolutePath: string; content: { rawContent: string } }) => {
        const normalizeAbsPath = file.absolutePath.replaceAll("\\", "/");

        if (modifiedFiles[normalizeAbsPath]) {
          file.content.rawContent = modifiedFiles[normalizeAbsPath];
        }
      }
    );

  console.log("Get compiler input");

  context.input = await hre.run(
    TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
    context
  );

  return null;
}

/**
 * The solc build subtask, this downloads the appropriate compiler
 * for the given solc version, then checks the hash of the solc binary.
 * As these checks are expensive, we cache in the workerState whether
 * the download and check has already been done
 * @param workerState the state shared between build jobs
 * @param buildJob the container for the context of the build job
 * @param solcVersion the solc compiler to download
 * @returns a promise that the context has been populated
 *  with the compiler path details
 */
async function getSolcBuild(
  {
    hre,
    tasks: { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD },
    compilerMetadataCache,
  }: WorkerState,
  { context }: BuildJob,
  solcVersion: string
) {
  try {
    const cachedBuildVersionPromise = compilerMetadataCache[solcVersion];

    if (cachedBuildVersionPromise !== undefined) {
      const cachedSolcBuild = await cachedBuildVersionPromise;

      context.solcBuild = cachedSolcBuild;

      return;
    }

    console.log("Get solc build");

    const solcBuildPromise = hre.run(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, {
      quiet: true,
      solcVersion,
    });

    compilerMetadataCache[solcVersion] = solcBuildPromise;

    const solcBuild: SolcBuild = await solcBuildPromise;

    context.solcBuild = solcBuild;
  } catch (err) {
    // remove the cached promise on build task failure
    delete compilerMetadataCache[solcVersion];

    throw err;
  }
}

function cancel({ jobId, projectBasePath }: BuildJob): {
  built: false;
  result: ValidationCompleteMessage;
} {
  return {
    built: false,
    result: {
      type: "VALIDATION_COMPLETE",
      status: "CANCELLED",
      jobId,
      projectBasePath,
    },
  };
}

function isJobCancelled(buildJob: BuildJob) {
  return buildJob.status === "cancelled";
}
