/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

export type VirtualProviderId = 'github' | 'azurerepos';

/**
 * Describes a virtual provider's identity.
 */
export interface ProviderDescriptor {
  readonly id: VirtualProviderId;
  readonly name: string;
}


export enum HeadType {
  Branch = 0,
  RemoteBranch = 1,
  Tag = 2,
  Commit = 3,
}

export type RevisionType = HeadType;
export type Provider = ProviderDescriptor;

export interface RevisionInfo {
  type: RevisionType;
  name: string;
  revision: string;
}

export interface Metadata {
  readonly provider: { readonly id: string; readonly name: string };
  readonly repo: Record<string, unknown>;

  getRevision(): Promise<RevisionInfo>;
}

// export type CreateUriOptions = Omit<Metadata, 'provider' | 'branch'>;

export interface RemoteHubApi {
  getMetadata(uri: Uri): Promise<Metadata | undefined>;

  // createProviderUri(provider: string, options: CreateUriOptions, path: string): Uri | undefined;
  getProvider(uri: Uri): Provider | undefined;
  getProviderUri(uri: Uri): Uri;
  getProviderRootUri(uri: Uri): Uri;
  isProviderUri(uri: Uri, provider?: string): boolean;

  // createVirtualUri(provider: string, options: CreateUriOptions, path: string): Uri | undefined;
  getVirtualUri(uri: Uri): Uri;
  getVirtualWorkspaceUri(uri: Uri): Uri | undefined;

  /**
   * Returns whether RemoteHub has the full workspace contents for a vscode-vfs:// URI.
   * This will download workspace contents if fetching full workspace contents is enabled
   * for the requested URI and the contents are not already available locally.
   * @param workspaceUri A vscode-vfs:// URI for a RemoteHub workspace folder.
   * @returns boolean indicating whether the workspace contents were successfully loaded.
   */
  loadWorkspaceContents(workspaceUri: Uri): Promise<boolean>;
}
