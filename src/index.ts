import ts from 'typescript';
import type { editor } from 'monaco-editor';
import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import type { Sandbox } from './vendor/sandbox';

import runtimeCheck from 'ts-transform-runtime-check/lib/transformer';

import typeDef from 'ts-transform-runtime-check/lib/index.d.ts';

interface PluginData {
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

// based on: https://github.com/denoland/deno/issues/2994
// TODO: make a custom BrowserFS build, current build sucks, includes to much and throws type errors

const pluginFactory = (utils: PluginUtils): PlaygroundPlugin => {
    const data: PluginData = {

    };

    const PackageModuleName = 'ts-transform-runtime-check';
    const PackageModuleTypeDef = `declare module '${PackageModuleName}' { ${typeDef.replace(/([\s])declare /gm, '$1')} }`;
    const PackageModuleTypeDefPath = '/shim.d.ts';

    return {
        id: 'playground-ts-transform-runtime-check',
        displayName: 'Runtime Check',
        data,
        shouldBeSelected() {
            return false;
        },
        async willMount(sandbox, container) {
            const { ts, tsvfs } = sandbox;
            const ds = utils.createDesignSystem(container);

            const button = ds.button({
                label: 'run AST transformer',
            });

            button.style.marginBottom = '16px';

            const code = ds.code('');

            /** get the compiler options */
            const compilerOptions = sandbox.getCompilerOptions();
            const fs = await tsvfs.createDefaultMapFromCDN(compilerOptions, ts.version, true, ts);
            fs.set(PackageModuleTypeDefPath, PackageModuleTypeDef);

            button.addEventListener('click', async () => {
                fs.set(sandbox.filepath, sandbox.getText());

                const system = tsvfs.createSystem(fs);
                const { compilerHost: host, updateFile } = tsvfs.createVirtualCompilerHost(system, compilerOptions, ts);

                const program = ts.createProgram({
                    rootNames: [sandbox.filepath, PackageModuleTypeDefPath],
                    options: compilerOptions,
                    host,
                });

                const sourceFile = program.getSourceFile(sandbox.filepath)!;
                const transformationResult = ts.transform(sourceFile, [runtimeCheck(program, { PackageModuleName } as any)], compilerOptions);
                const resultFile = transformationResult.transformed.find(file => file.fileName === sandbox.filepath);

                const writer = (ts as any).createTextWriter(host.getNewLine());
                const printer = ts.createPrinter();
                (printer as any).writeFile(resultFile, writer, void 0);
    
                const result = writer.getText() as string;

                sandbox.monaco.editor.colorize(result, 'ts', { tabSize: 4 }).then(result => {
                    code.innerHTML = result;
                });
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

        },
    };
};

export default pluginFactory;
