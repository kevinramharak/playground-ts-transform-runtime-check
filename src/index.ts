/// <reference path="./index.d.ts" />
import ts from 'typescript';
import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground"

import runtimeCheck from 'ts-transform-runtime-check';

const makePlugin = (utils: PluginUtils) => {
    const customPlugin: PlaygroundPlugin = {
        id: "ts-transform-runtime-check",
        displayName: "Runtime Check",
        didMount: (sandbox, container) => {

        },
        // This is called occasionally as text changes in monaco,
        // it does not directly map 1 keyup to once run of the function
        // because it is intentionally called at most once every 0.3 seconds
        // and then will always run at the end.
        modelChangedDebounce: async (sandbox, model, container) => {
                const containerDs = utils.createDesignSystem(container);
                containerDs.clear();
                const display = document.createElement("div")
                container.appendChild(display)
                const ds = utils.createDesignSystem(display);
                ds.clear();
                const options = sandbox.getCompilerOptions();

                const ts = sandbox.ts;
                const { createSystem, createDefaultMapFromCDN, createVirtualCompilerHost } = sandbox.tsvfs

                // for your time (e.g. you need to have es2015.lib.d.ts somewhere) - by grabbing the map from the TS CSN, tsvfs 
                // will re-use all the cached d.ts files which the playground uses.
                const fsMap = await createDefaultMapFromCDN({ target: options.target }, ts.version, true, ts)

                // We can add the file which represents the current file being edited (this could be: input.{ts,tsx,js,tsx})
                // as with the file content as being the current editor's text
                fsMap.set(sandbox.filepath, model.getValue())

                fsMap.set('node_modules/ts-transform-runtime-check/package.json', `{
                    "name": "ts-transform-runtime-check",
                    "version": "0.0.1-alpha5",
                    "main": "dist/index.js",
                    "description": "Typescript AST transformer to generate type checks at runtime",
                    "scripts": {
                        "build": "tsc"
                    },
                    "engines": {
                        "node": ">=12.10.0",
                        "npm": ">=6.10.3"
                    },
                    "browserlist": [
                        "last 1 chrome version",
                        "last 1 firefox version"
                    ],
                    "author": "Kevin Ramharak <kevin@ramharak.nl>",
                    "repository": {
                        "type": "git",
                        "url": "https://https://github.com/kevinramharak/ts-transform-runtime-check.git"
                    },
                    "types": "index.d.ts",
                    "license": "ISC",
                    "dependencies": {
                        "@types/node": "^14.14.20",
                        "ts-node": "^9.1.1",
                        "typescript": "^4.1.3",
                        "ttypescript": "1.5.12",
                        "ts-expose-internals": "^4.1.3"
                    }
                }`);
                fsMap.set('node_modules/ts-transform-runtime-check/index.d.ts', `
// TODO: figure out the API
// TODO: generate this

declare module 'ts-transform-runtime-check' {
    /**
     * check if \`value\` conforms to the runtime type of \`T\`
     */
    export function is<T>(value: unknown): value is T;
}`);

                // fsMap is now a Map which has all of the lib.d.ts files needed for your current compiler settings
                const system = createSystem(fsMap)
                
                // TypeScript has a system called 'hosts'
                const host = createVirtualCompilerHost(system, options, sandbox.ts);

                host.compilerHost.resolveModuleNames = (moduleNames, containingFile, reusedNames, redirectedReference, options) => {
                    return moduleNames.map(name => {
                        return {
                            resolvedFileName: 'node_modules/ts-transform-runtime-check/index.d.ts',
                            isExternalLibraryImport: true,
                            extension: '.ts',
                            packageId: {
                                name: 'ts-transform-runtime-check',
                                subModuleName: '',
                                version: '0.0.0-alpha5',
                            },
                        } as ts.ResolvedModuleFull;
                    });
                };

                const program = ts.createProgram({
                    rootNames: [sandbox.filepath],
                    options,
                    host: host.compilerHost,
                });

                const sourceFile = program.getSourceFile(sandbox.filepath)!;

                const code = ds.code("");
                program.emit(sourceFile, async (filename, content) => {
                    if (filename === '/input.js') {
                        const html = await sandbox.monaco.editor.colorize(content, 'typescript', {});
                        code.innerHTML = html;
                    }
                }, void 0, false, { before: [ runtimeCheck(program) ] });
        },

        // Gives you a chance to remove anything set up,
        // the container itself if wiped of children after this.
        didUnmount: () => { },
    }

    return customPlugin
}

export default makePlugin
