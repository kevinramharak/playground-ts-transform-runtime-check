import ts from 'typescript';
import type { editor } from 'monaco-editor';
import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import type { Sandbox } from './vendor/sandbox';

import { createBrowserFSBackedSystem, createBrowserFSCompilerHost, createRootFileSystem, GlobalHost, installBfs, FileSystem } from './browserfs';
import type { FSModule } from 'browserfs/dist/node/core/FS';

import runtimeCheck from 'ts-transform-runtime-check';

interface PluginData {
    global: GlobalHost,
    fs: FSModule,
}

interface PackageJson {
    types?: string;
    name: string;
}

const fetchUnpkgModulePackageInfo = (name: string) => {
    return fetch(`https://www.unpkg.com/${name}/package.json`)
        .then(response => response.json() as Promise<PackageJson>);
};

const fetchUnpkgModuleFile = (name: string, file: string) => {
    return fetch(`https://www.unpkg.com/${name}/${file}`).then(response => response.text());
}


// TODO: make a custom BrowserFS build, current build sucks, includes to much and throws type errors

const pluginFactory = (utils: PluginUtils): PlaygroundPlugin => {
    // NOTE: BrowserFS types suck and its api is weirdly async, these wrapper functions make it manageble
    const global = installBfs();
    const root = createRootFileSystem({
        fs: 'InMemory',
    });
    /** `fs` isn't actually initialised until `root` is resolved, but this does give us the sync api calls that the ts compiler requires */
    const fs = global.require('fs');

    const data: PluginData = {
        global,
        fs,
    };

    function mkdirpSync(p: string, mode: number): void {
        if (!fs.existsSync(p)) {
            mkdirpSync(global.require('path').dirname(p), mode);
            fs.mkdirSync(p, mode);
        }
    }
    

    const runtimeCheckModuleName = 'ts-transform-runtime-check';
    let error: Error | undefined;
    fetchUnpkgModulePackageInfo(runtimeCheckModuleName).then(meta => {
        if (!meta.types) {
            return Promise.reject();
        }
        return fetchUnpkgModuleFile(meta.name, meta.types).then(content => {
            return {
                path: `${meta.name}/${meta.types}`,
                content,
            }
        });
    }).then(file => {
        mkdirpSync(global.require('path').dirname(`node_modules/${file.path}`), 0o777);
        fs.writeFile(`node_modules/${file.path}`, file.content);
    }).catch(e => {
        error = e;
    });

    return {
        id: 'playground-ts-transform-runtime-check',
        displayName: 'Runtime Check AST transformer',
        data,
        shouldBeSelected() {
            return false;
        },
        willMount(sandbox, container) {
            /**
             * A `ts.System` interface backed by `BrowserFS`
             * // NOTE: that the `root` filesystem does the actual operations, if it does not support sync operations it will throw */
            const system = createBrowserFSBackedSystem(global, fs);

            const ds = utils.createDesignSystem(container);

            if (error) {
                ds.title(`something went wrong while trying to fetch 'ts-transform-runtime-check' files needed to compile`);
                ds.code(error.stack as any || error.message || '');
                return;
            }

            const button = ds.button({
                label: 'Compile with the AST Transformer',
            });

            button.style.marginBottom = '16px';

            const code = ds.code('');

            button.addEventListener('click', async () => {
                /** get the `ts` from the sandbox */
                const { ts } = sandbox;
                const { createDefaultMapFromCDN } = sandbox.tsvfs;

                /** get the compiler options */
                const compilerOptions = sandbox.getCompilerOptions();

                /**
                 * A `ts.CompilerHost` interface backed by BrowserFS backed `ts.System`
                 */
                const host = createBrowserFSCompilerHost(global, system, compilerOptions, ts);

                /** 
                 * get the typescript default library files and put them in our file system
                 * NOTE: the internal function uses lzstring for caching/compression
                 */
                const libDTSFiles = await createDefaultMapFromCDN(compilerOptions, ts.version, false, ts);
                system.createDirectory('libs');
                [...libDTSFiles.entries()].forEach(([name, content]) => {
                    system.writeFile(`libs/${name}`, content);
                });

                // add the sandbox code to the filesystem
                system.writeFile(sandbox.filepath, sandbox.getText());

                const program = ts.createProgram({
                    rootNames: [sandbox.filepath],
                    options: compilerOptions,
                    host,
                });

                const sourceFile = program.getSourceFile(sandbox.filepath);

                program.emit(sourceFile, (fileName, content) => {
                    if (fileName.endsWith('.js')) {
                        sandbox.monaco.editor.colorize(content, 'typescript', {}).then(highlighted => {
                            code.innerHTML = highlighted;
                        });
                    }
                }, void 0, false, { before: [runtimeCheck(program)] });
            });
        },
        didMount(sandbox, container) {

        },
        willUnmount(sandbox, container) {

        },
        didUnmount(sandbox, container) {

        },
        modelChanged(sandbox, model) {

        },
        modelChangedDebounce(sandbox, model) {
            const contents = model.getValue();
            fs.writeFile(sandbox.filepath, contents);

            // something like this to fetch files and store the promises, then the compile button can await those promises before actually compiling
            // TODO: might as well check local storage for package.json and .d.ts files
            // based on: https://github.com/denoland/deno/issues/2994
            function recursivelyPreProcessFile(content: string) {
                const info = ts.preProcessFile(model.getValue(), true);
                info.importedFiles.forEach(({ fileName }) => {

                });
            }
        },
    };
};

export default pluginFactory;
