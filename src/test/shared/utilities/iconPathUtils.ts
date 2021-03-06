/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../../../shared/extensionGlobals'

export interface IconPath {
    light: vscode.Uri
    dark: vscode.Uri
}

export function setupTestIconPaths() {
    ext.iconPaths.dark.help = '/icons/dark/help'
    ext.iconPaths.light.help = '/icons/light/help'

    ext.iconPaths.dark.cloudFormation = '/icons/dark/cloudformation'
    ext.iconPaths.light.cloudFormation = '/icons/light/cloudformation'

    ext.iconPaths.dark.cloudWatchLogGroup = '/icons/dark/cloudWatchLogGroup'
    ext.iconPaths.light.cloudWatchLogGroup = '/icons/light/cloudWatchLogGroup'

    ext.iconPaths.dark.lambda = '/icons/dark/lambda'
    ext.iconPaths.light.lambda = '/icons/light/lambda'

    ext.iconPaths.dark.settings = '/icons/dark/settings'
    ext.iconPaths.light.settings = '/icons/light/settings'

    ext.iconPaths.dark.registry = '/icons/dark/registry'
    ext.iconPaths.light.registry = '/icons/light/registry'

    ext.iconPaths.dark.s3 = '/icons/dark/s3'
    ext.iconPaths.light.s3 = '/icons/light/s3'

    ext.iconPaths.dark.folder = '/icons/dark/folder'
    ext.iconPaths.light.folder = '/icons/light/folder'

    ext.iconPaths.dark.file = '/icons/dark/file'
    ext.iconPaths.light.file = '/icons/light/file'

    ext.iconPaths.dark.schema = '/icons/dark/schema'
    ext.iconPaths.light.schema = '/icons/light/schema'
}

export function clearTestIconPaths() {
    ext.iconPaths.dark.help = ''
    ext.iconPaths.light.help = ''

    ext.iconPaths.dark.cloudFormation = ''
    ext.iconPaths.light.cloudFormation = ''

    ext.iconPaths.dark.lambda = ''
    ext.iconPaths.light.lambda = ''

    ext.iconPaths.dark.settings = ''
    ext.iconPaths.light.settings = ''

    ext.iconPaths.dark.registry = ''
    ext.iconPaths.light.registry = ''

    ext.iconPaths.dark.s3 = ''
    ext.iconPaths.light.s3 = ''

    ext.iconPaths.dark.folder = ''
    ext.iconPaths.light.folder = ''

    ext.iconPaths.dark.file = ''
    ext.iconPaths.light.file = ''

    ext.iconPaths.dark.schema = ''
    ext.iconPaths.light.schema = ''
}
