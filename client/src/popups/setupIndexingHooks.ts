import {
  workspace,
  TextDocument,
  languages,
  LanguageStatusSeverity,
  LanguageStatusItem,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { ExtensionState } from "../types";

const INDEXING_JOB_ID = "indexing";

export function setupIndexingHooks(
  extensionState: ExtensionState,
  client: LanguageClient
): void {
  client
    .onReady()
    .then(() => {
      const indexingStartDisposable = client.onNotification(
        "custom/indexing-start",
        () => {
          const indexingStatusItem = setupIndexingLanguageStatusItem();

          extensionState.currentIndexingJobs.push(indexingStatusItem);
        }
      );

      const indexingEndDisposable = client.onNotification(
        "custom/indexing-end",
        () => {
          const indexingStatusItem = extensionState.currentIndexingJobs.find(
            (statusItem) => statusItem.id === INDEXING_JOB_ID
          );

          indexingStatusItem?.dispose();

          triggerValidationForOpenDoc(client);
        }
      );

      extensionState.listenerDisposables.push(indexingStartDisposable);
      extensionState.listenerDisposables.push(indexingEndDisposable);
    })
    .catch((reason) => extensionState.logger.error(reason));
}

function setupIndexingLanguageStatusItem(): LanguageStatusItem {
  const statusItem = languages.createLanguageStatusItem(INDEXING_JOB_ID, {
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
function triggerValidationForOpenDoc(client: LanguageClient) {
  workspace.textDocuments.forEach((doc) => {
    // Only trigger files that belong to the project whose worker is ready
    notifyOfNoopChange(client, doc);
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
