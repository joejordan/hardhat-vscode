import {
  workspace,
  window,
  TextDocument,
  languages,
  LanguageStatusSeverity,
  LanguageStatusItem,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { updateHardhatProjectLanguageItem } from "../languageitems/hardhatProject";
import { ExtensionState } from "../types";

interface IndexFileData {
  jobId: number;
  path: string;
  current: number;
  total: number;
}

export function setupIndexingHooks(
  extensionState: ExtensionState,
  client: LanguageClient
): void {
  client
    .onReady()
    .then(() => {
      const indexingStartDisposable = client.onNotification(
        "custom/indexing-start",
        (data: IndexFileData) => {
          const indexingStatusItem = setupIndexingLanguageStatusItem(
            data.jobId
          );

          extensionState.currentIndexingJobs.push(indexingStatusItem);
        }
      );

      const indexDisposable = client.onNotification(
        "custom/indexing-file",
        async (data: IndexFileData) => {
          const jobId = data.jobId.toString();
          const indexingStatusItem = extensionState.currentIndexingJobs.find(
            (si) => si.id === jobId
          );

          if (!indexingStatusItem) {
            return;
          }

          if (indexingStatusItem.detail === undefined) {
            indexingStatusItem.detail = `${data.total} files`;
          }

          // check to display language status item
          if (
            window.activeTextEditor &&
            window.activeTextEditor.document.uri.path.endsWith(data.path)
          ) {
            await updateHardhatProjectLanguageItem(extensionState, {
              uri: window.activeTextEditor.document.uri.path,
            });
          }

          if (data.total !== data.current) {
            return;
          }

          if (window.activeTextEditor && data.total === 0) {
            await updateHardhatProjectLanguageItem(extensionState, {
              uri: window.activeTextEditor.document.uri.path,
            });
          }

          indexingStatusItem.busy = false;
          indexingStatusItem.dispose();
        }
      );

      const workerInitializedDisposable = client.onNotification(
        "custom/worker-initialized",
        (data: { projectBasePath: string }) => {
          // Files that were open on vscode load, will
          // have swallowed the `didChange` event as the
          // language server wasn't intialized yet. We
          // revalidate open editor files after indexing
          // to ensure warning and errors appear on startup.
          triggerValidationForOpenDoc(client, data.projectBasePath);
        }
      );

      extensionState.listenerDisposables.push(indexingStartDisposable);
      extensionState.listenerDisposables.push(indexDisposable);
      extensionState.listenerDisposables.push(workerInitializedDisposable);
    })
    .catch((reason) => extensionState.logger.error(reason));
}

function setupIndexingLanguageStatusItem(jobId: number): LanguageStatusItem {
  const statusItem = languages.createLanguageStatusItem(jobId.toString(), {
    language: "solidity",
  });

  statusItem.severity = LanguageStatusSeverity.Information;
  statusItem.name = `Indexing`;
  statusItem.text = `Scanning for sol files`;
  statusItem.detail = undefined;
  statusItem.busy = true;

  return statusItem;
}

/**
 * If the doc is open, trigger a noop change on the server to start validation.
 */
function triggerValidationForOpenDoc(
  client: LanguageClient,
  projectBasePath: string
) {
  workspace.textDocuments.forEach((doc) => {
    // Only trigger files that belong to the project whose worker is ready
    if (doc.uri.path.includes(projectBasePath)) {
      notifyOfNoopChange(client, doc);
    }
  });
}

/**
 * Sends a no-op change notification to the server, this allows the
 * triggering of validation.
 * @param client the language client
 * @param textDoc the open text file to trigger validation on
 */
function notifyOfNoopChange(client: LanguageClient, textDoc: TextDocument) {
  client.sendNotification("textDocument/didChange", {
    textDocument: {
      version: textDoc.version,
      uri: textDoc.uri.toString(),
    },
    contentChanges: [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        rangeLength: 1,
        text: "",
      },
    ],
  });
}
