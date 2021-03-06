/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AdmZip from 'adm-zip'
import { Lambda } from 'aws-sdk'
import * as fs from 'fs-extra'
import * as _ from 'lodash'
import * as path from 'path'
import * as request from 'request'
import * as vscode from 'vscode'
import { LaunchConfiguration, getReferencedHandlerPaths } from '../../shared/debug/launchConfiguration'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder, fileExists } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { createCodeAwsSamDebugConfig } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import * as telemetry from '../../shared/telemetry/telemetry'
import { ExtensionDisposableFiles } from '../../shared/utilities/disposableFiles'
import * as pathutils from '../../shared/utilities/pathUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { getFamily, RuntimeFamily } from '../models/samLambdaRuntime'
import { showConfirmationMessage } from '../../s3/util/messages'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'
import { promptUserForLocation, WizardContext } from '../../shared/wizards/multiStepWizard'

// TODO: Move off of deprecated `request` to `got`?
// const pipeline = promisify(Stream.pipeline)

export async function importLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await runImportLambda(functionNode)

    telemetry.recordLambdaImport({
        result,
        runtime: functionNode.configuration.Runtime as telemetry.Runtime | undefined,
    })
}

async function runImportLambda(functionNode: LambdaFunctionNode, window = Window.vscode()): Promise<telemetry.Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const functionName = functionNode.configuration.FunctionName!

    if (workspaceFolders.length === 0) {
        window.showErrorMessage(
            localize('AWS.lambda.import.noWorkspaceFolders', 'Open a workspace before importing a Lambda function.')
        )
        return 'Cancelled'
    }
    const selectedUri = await promptUserForLocation(new WizardContext())
    if (!selectedUri) {
        return 'Cancelled'
    }

    const importLocation = path.join(selectedUri.fsPath, functionName, path.sep)
    const importLocationName = vscode.workspace.asRelativePath(importLocation, true)

    if (await fs.pathExists(importLocation)) {
        const isConfirmed = await showConfirmationMessage(
            {
                prompt: localize(
                    'AWS.lambda.import.prompt',
                    'Importing {0} into: {1}\nExisting directory will be overwritten: {0}\nProceed with import?',
                    functionName,
                    importLocationName
                ),
                confirm: localize('AWS.lambda.import.import', 'Import'),
                cancel: localize('AWS.generic.cancel', 'Cancel'),
            },
            window
        )

        if (!isConfirmed) {
            getLogger().info('ImportLambda cancelled')
            return 'Cancelled'
        }
    }

    if (
        workspaceFolders.filter(val => {
            return selectedUri === val.uri
        }).length === 0
    ) {
        await addFolderToWorkspace({ uri: selectedUri! }, true)
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(importLocation))!

    return await window.withProgress<telemetry.Result>(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: localize(
                'AWS.lambda.import.status',
                'Importing Lambda function {0} into {1}...',
                functionName,
                importLocationName
            ),
        },
        async progress => {
            const lambdaLocation = path.join(importLocation, getLambdaFileNameFromHandler(functionNode.configuration))
            try {
                await downloadAndUnzipLambda(progress, functionNode, importLocation)
                await openLambdaFile(lambdaLocation)
                await addLaunchConfigEntry(lambdaLocation, functionNode, workspaceFolder)

                return 'Succeeded'
            } catch (e) {
                if (e instanceof ImportError) {
                    // failed the download/unzip step. Non-functional, definite failure
                    return 'Failed'
                }

                // failed to open handler file or add launch config.
                // not a failure since the function is downloaded to a workspace directory.
                return 'Succeeded'
            }
        }
    )
}

async function downloadAndUnzipLambda(
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>,
    functionNode: LambdaFunctionNode,
    importLocation: string,
    window = Window.vscode(),
    lambda = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
): Promise<void> {
    const functionArn = functionNode.configuration.FunctionArn!
    try {
        const tempFolder = await makeTemporaryToolkitFolder()
        ExtensionDisposableFiles.getInstance().addFolder(tempFolder)
        const downloadLocation = path.join(tempFolder, 'function.zip')

        const response = await lambda.getFunction(functionArn)
        const codeLocation = response.Code?.Location!

        // arbitrary increments since there's no "busy" state for progress bars
        progress.report({ increment: 10 })

        // TODO: Move off of deprecated `request` to `got`?
        // await pipeline(got.stream(codeLocation), fs.createWriteStream(downloadLocation))

        await new Promise(resolve => {
            getLogger().debug('Starting Lambda download...')
            request
                .get(codeLocation)
                .on('response', () => {
                    getLogger().debug('Established Lambda download')
                })
                .on('complete', () => {
                    getLogger().debug('Lambda download complete')
                    resolve()
                })
                .on('error', err => {
                    throw err
                })
                .pipe(fs.createWriteStream(downloadLocation))
        })

        progress.report({ increment: 70 })

        await new Promise(resolve => {
            new AdmZip(downloadLocation).extractAllToAsync(importLocation, true, err => {
                if (err) {
                    throw err
                }
                progress.report({ increment: 10 })
                resolve()
            })
        })
    } catch (e) {
        const err = e as Error
        getLogger().error(err)
        window.showErrorMessage(
            localize(
                'AWS.lambda.import.importError',
                'Error importing Lambda function {0}: {1}',
                functionArn,
                err.message
            )
        )

        throw new ImportError()
    }
}

export async function openLambdaFile(lambdaLocation: string, window = Window.vscode()): Promise<void> {
    if (!(await fileExists(lambdaLocation))) {
        const warning = localize(
            'AWS.lambda.import.fileNotFound',
            'Handler file {0} not found in imported function.',
            lambdaLocation
        )
        getLogger().warn(warning)
        window.showWarningMessage(warning)
        throw new Error()
    }
    // TODO: move this into Window.vscode()?
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(lambdaLocation))
    await vscode.window.showTextDocument(doc)
}

async function addLaunchConfigEntry(
    lambdaLocation: string,
    functionNode: LambdaFunctionNode,
    workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
    const handler = functionNode.configuration.Handler!

    const samDebugConfig = createCodeAwsSamDebugConfig(
        workspaceFolder,
        handler,
        path.dirname(lambdaLocation),
        functionNode.configuration.Runtime!
    )

    const launchConfig = new LaunchConfiguration(vscode.Uri.file(lambdaLocation))
    if (
        !getReferencedHandlerPaths(launchConfig).has(
            pathutils.normalize(path.join(path.dirname(lambdaLocation), handler))
        )
    ) {
        await launchConfig.addDebugConfiguration(samDebugConfig)
    }
}

/**
 * Converts Lambda handler into a filename by stripping the function name and appending the correct file extension.
 * Only works for supported languages (Python/JS)
 * @param configuration Lambda configuration object from getFunction
 */
export function getLambdaFileNameFromHandler(configuration: Lambda.FunctionConfiguration): string {
    let runtimeExtension: string
    switch (getFamily(configuration.Runtime!)) {
        case RuntimeFamily.Python:
            runtimeExtension = 'py'
            break
        case RuntimeFamily.NodeJS:
            runtimeExtension = 'js'
            break
        default:
            throw new Error(`Toolkit does not currently support imports for runtime: ${configuration.Runtime}`)
    }

    const fileName = _(configuration.Handler!)
        .split('.')
        .initial()
        .join('.')

    return `${fileName}.${runtimeExtension}`
}

class ImportError extends Error {}
