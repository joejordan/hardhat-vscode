import vscode from "vscode";
import assert from "assert";
import { getClient } from "../../client";
import { Client } from "../../common/types";
import { assertLspCommand } from "../../common/assertLspCommand";
import { getTestContractUri } from "../../helpers/getTestContract";
import {
  getCurrentEditor,
  goToPosition,
  openFileInEditor,
} from "../../helpers/editor";
import { assertPositionEqual } from "../../helpers/assertions";

suite("Single-file Navigation", function () {
  const testUri = getTestContractUri("main/contracts/definition/Test.sol");
  const importTestUri = getTestContractUri(
    "main/contracts/definition/ImportTest.sol"
  );

  let client!: Client;

  suiteSetup(async () => {
    client = await getClient();
  });

  test("[Single-file] - Go to Definition", async () => {
    await assertLspCommand(client, {
      action: "DefinitionRequest",
      uri: testUri.path,
      params: {
        position: {
          line: 14,
          character: 25,
        },
      },
      expected: [
        {
          uri: {
            path: getTestContractUri("main/contracts/definition/Test.sol").path,
          },
          range: [
            {
              line: 9,
              character: 11,
            },
            {
              line: 9,
              character: 16,
            },
          ],
        },
      ],
    });
  });

  test("[Single-file][Defined after usage] - Go to Definition", async () => {
    await assertLspCommand(client, {
      action: "DefinitionRequest",
      uri: testUri.path,
      params: {
        position: {
          line: 15,
          character: 9,
        },
      },
      expected: [
        {
          uri: {
            path: getTestContractUri("main/contracts/definition/Test.sol").path,
          },
          range: [
            {
              line: 53,
              character: 11,
            },
            {
              line: 53,
              character: 19,
            },
          ],
        },
      ],
    });
  });

  test("[Single-file][MemberAccess] - Go to Definition", async () => {
    await assertLspCommand(client, {
      action: "DefinitionRequest",
      uri: testUri.path,
      params: {
        position: {
          line: 26,
          character: 25,
        },
      },
      expected: [
        {
          uri: {
            path: getTestContractUri("main/contracts/definition/Test.sol").path,
          },
          range: [
            {
              line: 10,
              character: 13,
            },
            {
              line: 10,
              character: 18,
            },
          ],
        },
      ],
    });
  });

  test("[Single-file][MemberAccess][Defined after usage] - Go to Definition", async () => {
    await assertLspCommand(client, {
      action: "DefinitionRequest",
      uri: testUri.path,
      params: {
        position: {
          line: 50,
          character: 50,
        },
      },
      expected: [
        {
          uri: {
            path: getTestContractUri("main/contracts/definition/Test.sol").path,
          },
          range: [
            {
              line: 54,
              character: 16,
            },
            {
              line: 54,
              character: 20,
            },
          ],
        },
      ],
    });
  });

  test("Jump to import file", async () => {
    await openFileInEditor(importTestUri);

    goToPosition(new vscode.Position(3, 25));

    await vscode.commands.executeCommand("editor.action.goToDeclaration");

    assert.equal(
      getCurrentEditor().document.fileName,
      getTestContractUri("main/contracts/definition/Foo.sol").path
    );
    assertPositionEqual(
      getCurrentEditor().selection.active,
      new vscode.Position(1, 0)
    );
  });

  test("Jump to import dependency file", async () => {
    await openFileInEditor(importTestUri);

    goToPosition(new vscode.Position(4, 73));

    await vscode.commands.executeCommand("editor.action.goToDeclaration");

    assert.equal(
      getCurrentEditor().document.fileName,
      getTestContractUri(
        "../node_modules/@openzeppelin/contracts/access/Ownable.sol"
      ).path
    );
    assertPositionEqual(
      getCurrentEditor().selection.active,
      new vscode.Position(3, 0)
    );
  });
});
