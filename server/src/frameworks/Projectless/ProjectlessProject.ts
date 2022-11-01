import { analyze } from "@nomicfoundation/solidity-analyzer";
import fs from "fs";
import _ from "lodash";
import path from "path";
import semver from "semver";
import { DidChangeWatchedFilesParams } from "vscode-languageserver-protocol";
import { analyzeSolFile } from "../../parser/analyzer/analyzeSolFile";
import { OpenDocuments, ServerState } from "../../types";
import { toUnixStyle } from "../../utils";
import { getOrInitialiseSolFileEntry } from "../../utils/getOrInitialiseSolFileEntry";
import CompilationDetails from "../base/CompilationDetails";
import Project from "../base/Project";

interface SolFileDetails {
  path: string;
  pragmas: string[];
}

export default class ProjectlessProject extends Project {
  // These are in place just to implement ISolProject. Should be removed after refactor
  public configPath = undefined;

  public priority = 0;

  constructor(serverState: ServerState, basePath: string) {
    super(serverState, basePath);
  }

  public id(): string {
    return "projectless";
  }

  public frameworkName(): string {
    return "Projectless";
  }

  public async initialize(): Promise<void> {
    return;
  }

  public async fileBelongs(_file: string) {
    return true;
  }

  public async resolveImportPath(file: string, importPath: string) {
    try {
      const resolvedPath = require.resolve(importPath, {
        paths: [fs.realpathSync(path.dirname(file))],
      });

      return toUnixStyle(fs.realpathSync(resolvedPath));
    } catch (error) {
      return undefined;
    }
  }

  public async buildCompilation(
    sourceUri: string,
    openDocuments: OpenDocuments
  ): Promise<CompilationDetails> {
    const documentText = openDocuments.find(
      (doc) => doc.uri === sourceUri
    )?.documentText;

    if (documentText === undefined) {
      throw new Error(
        `sourceUri (${sourceUri}) should be included in openDocuments ${JSON.stringify(
          openDocuments.map((doc) => doc.uri)
        )} `
      );
    }

    const dependencyDetails = await this._crawlDependencies(sourceUri);
    const pragmas = _.flatten(_.map(dependencyDetails, "pragmas"));

    const solcVersion = semver.maxSatisfying(
      this.serverState.solcVersions,
      pragmas.join(" ")
    );

    if (solcVersion === null) {
      throw new Error(`No available solc version satisfying ${pragmas}`);
    }

    const contractsToCompile = _.map(dependencyDetails, "path");
    const sources: { [uri: string]: { content: string } } = {};
    for (const contract of contractsToCompile) {
      const contractText =
        openDocuments.find((doc) => doc.uri === contract)?.documentText ??
        this.serverState.solFileIndex[contract].text;
      if (contractText === undefined) {
        throw new Error(`Contract not indexed: ${contract}`);
      }
      sources[contract] = { content: contractText };
    }

    sources[sourceUri] = { content: documentText };

    return {
      input: {
        language: "Solidity",
        sources,
        settings: {
          outputSelection: {},
          optimizer: {
            enabled: false,
            runs: 200,
          },
        },
      },
      solcVersion,
    };
  }

  public async onWatchedFilesChanges(
    _params: DidChangeWatchedFilesParams
  ): Promise<void> {
    return;
  }

  private async _crawlDependencies(
    sourceUri: string,
    visited: string[] = []
  ): Promise<SolFileDetails[]> {
    if (visited.includes(sourceUri)) {
      return [];
    }

    let text = this.serverState.solFileIndex[sourceUri]?.text;

    if (text === undefined) {
      // TODO: inject this
      const solFileEntry = getOrInitialiseSolFileEntry(
        this.serverState,
        sourceUri
      );

      if (!solFileEntry.isAnalyzed()) {
        await analyzeSolFile(this.serverState, solFileEntry);
      }
    }

    text = this.serverState.solFileIndex[sourceUri]?.text;

    if (text === undefined) {
      throw new Error(`Couldnt find/index ${sourceUri}`);
    }

    visited.push(sourceUri);

    // Analyze current file for import strings and pragmas
    const { imports, versionPragmas } = analyze(text);

    // Build list with current file and prepare for dependencies
    const dependencyDetails = [{ path: sourceUri, pragmas: versionPragmas }];

    // Recursively crawl dependencies and append. Skip non-existing imports
    const importsUris: string[] = [];
    for (const _import of imports) {
      const resolvedImport = await this.resolveImportPath(sourceUri, _import);

      if (resolvedImport !== undefined) {
        importsUris.push(resolvedImport);
      }
    }

    for (const importUri of importsUris) {
      dependencyDetails.push(
        ...(await this._crawlDependencies(importUri, visited))
      );
    }

    return dependencyDetails;
  }
}
