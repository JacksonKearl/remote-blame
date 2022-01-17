// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Octokit from "@octokit/rest";
import { RemoteHubApi } from './remotehubApi';

type Commit = {
  oid: string
  authoredDate: string
  message: string
  url: string
  author: {
    name: string
    user: {
      url: string
      avatarUrl: string
    }
  }
};

type BlameResult = {
  repository: {
    object: {
      blame: {
        ranges: {
          startingLine: number
          endingLine: number
          age: number
          commit: {
            oid: string,
            message: string
            authoredDate: string
            url: string
            author: {
              name: string
              user: {
                url: string
                avatarUrl: string
              }
            }
          }
        }[]
      }
    }
  }
};


const makeQuery = (name: string, owner: string, ref: string, path: string) => `
query {
  repository(name: "${name}", owner:"${owner}") {
    object(expression: "${ref}") {
      ... on Commit {
      blame(path: "${path}") {
          ranges {
            startingLine
            endingLine
            age
            commit {
              oid
              message
              authoredDate
              url
              author {
                name
                user {
                  url
                  avatarUrl
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const cache: Map<string, Promise<BlameResult | undefined>> = new Map();

const getBlameForUri = async (uri: vscode.Uri, cancellation?: vscode.CancellationToken): Promise<BlameResult | undefined> => {
  const cacheKey = uri.toString();
  if (cache.has(cacheKey)) { return cache.get(cacheKey); }

  const resolver = new Promise<BlameResult | undefined>(async (c, e) => {
    try {
      const token = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
      if (cancellation?.isCancellationRequested) { return undefined; }

      const octokit = new Octokit.Octokit({ auth: token?.accessToken });
      const remotehub = (await vscode.extensions.getExtension('github.remotehub')?.activate()) as RemoteHubApi;
      const meta = await remotehub.getMetadata(uri);
      const revision = await meta?.getRevision() as { revision: string };
      if (cancellation?.isCancellationRequested) { return undefined; }

      const providerUri = remotehub.getProviderUri(uri);
      const [_, owner, repo, path] = /^\/([^/]*)\/([^/]*)\/(.*)$/.exec(providerUri.path)!;
      const query = makeQuery(repo, owner, revision.revision, path,);
      const data: BlameResult = await octokit.graphql(query);
      if (data.repository.object.blame.ranges) {
        cache.set(cacheKey, Promise.resolve(data));
        c(data);
      }
    } catch (err) {
      cache.delete(cacheKey);
      e(err);
    }
  });

  cache.set(cacheKey, resolver);

  return resolver;
};



export async function activate(context: vscode.ExtensionContext) {
  let dis = false;

  const remotehub = (await vscode.extensions.getExtension('github.remotehub')?.activate()) as RemoteHubApi;

  vscode.languages.registerHoverProvider({ scheme: 'vscode-vfs' }, {
    async provideHover(document, position, token) {
      if (!dis) { return undefined; }
      const data = await getBlameForUri(document.uri, token);
      if (!data) { return undefined; }
      const range = data.repository.object.blame.ranges.find((range) =>
        range.startingLine <= position.line && range.endingLine >= position.line
      );

      const providerUri = remotehub.getProviderUri(document.uri);
      const [_, owner, repo, path] = /^\/([^/]*)\/([^/]*)\/(.*)$/.exec(providerUri.path)!;
      const renderCommit = (commit: Commit) => {
        let str = `[${commit.author.name}](${commit.author.user.url}) *[(${commit.oid.slice(0, 6)})](${commit.url})*: ${commit.message}`;
        str = str.replace(/#(\d+)/g, (_, num) => `[#${num}](https://github.com/${owner}/${repo}/issues/${num})`);
        return str;
      };

      if (range) {
        return {
          contents: [new vscode.MarkdownString(renderCommit(range.commit))]
        };
      }
    }
  });

  const colors = [
    '#ff941a',
    '#f0843d',
    '#e07352',
    '#d06266',
    '#bd5175',
    '#a94285',
    '#7c21a6',
    '#5910b2',
    '#953295',
    '#0000c2',
    '#000000',
  ];
  const decorations = Array.from({ length: 11 }).map((_, i) =>
    vscode.window.createTextEditorDecorationType({ overviewRulerLane: vscode.OverviewRulerLane.Right, overviewRulerColor: colors[i], rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed })
  );

  const showHeatForEditor = async (e: vscode.TextEditor) => {
    if (!dis) {
      for (const [i, dec] of Object.entries(decorations)) {
        e.setDecorations(decorations[+i], []);
      }
      return undefined;
    }

    if (e) {
      const data = await getBlameForUri(e.document.uri);
      if (!data) { return undefined; }

      const editorDecorations: { line: number }[][] = Array.from({ length: 11 }).map(() => []);
      data.repository.object.blame.ranges.forEach(range => {
        for (let line = range.startingLine - 1; line <= range.endingLine - 1; line++) {
          editorDecorations[range.age]?.push({ line });
        }
      });

      for (const [i, dec] of Object.entries(editorDecorations)) {
        e.setDecorations(decorations[+i], dec.map(d => new vscode.Range(d.line, 0, d.line, 10000)));
      }
    }
  };

  // vscode.window.
  vscode.window.onDidChangeActiveTextEditor(async (e) => {
    if (e) {
      showHeatForEditor(e);
    }
  });

  context.subscriptions.push(...[
    vscode.commands.registerCommand('remote-blame.showBlame', async () => {
      dis = true;
      const e = vscode.window.activeTextEditor;
      if (e) { await showHeatForEditor(e); }
      vscode.commands.executeCommand('setContext', 'blameShowing', true);
    }),
    vscode.commands.registerCommand('remote-blame.hideBlame', async () => {
      const e = vscode.window.activeTextEditor;
      if (e) { await showHeatForEditor(e); }
      vscode.commands.executeCommand('setContext', 'blameShowing', false);
    }),
    { dispose() { cache.clear(); } }]);
}

export function deactivate() { }
