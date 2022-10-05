import {
  ClientTrackingState,
  ISolFileEntry,
  TextDocument,
} from "@common/types";
import Project from "../frameworks/base/Project";
import { ServerState } from "../types";
import { runningOnWindows } from "../utils/operatingSystem";

export function getOpenDocumentsInProject(
  serverState: ServerState,
  project: Project
): TextDocument[] {
  const openSolFilesInProj = Object.values(serverState.solFileIndex).filter(
    (solfile) =>
      solfile.tracking === ClientTrackingState.TRACKED &&
      solfile.project.basePath === project.basePath
  );

  const openDocuments = openSolFilesInProj
    .map((solFile) => lookupDocForSolFileEntry(serverState, solFile))
    .filter((doc): doc is TextDocument => doc !== undefined);

  if (openDocuments.length < openSolFilesInProj.length) {
    serverState.logger.info("Open document lookup has dropped files");
  }

  return openDocuments;
}

function lookupDocForSolFileEntry(
  serverState: ServerState,
  solFile: ISolFileEntry
): TextDocument | undefined {
  const convertedUri = runningOnWindows()
    ? `file:///${solFile.uri.replace(":", "%3A")}`
    : `file://${solFile.uri}`;

  return serverState.documents.get(convertedUri);
}
