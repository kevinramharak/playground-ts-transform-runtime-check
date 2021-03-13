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
    const data: PluginData = {};

    const PackageModuleName = 'ts-transform-runtime-check';
    const PackageModuleTypeDef = `declare module '${PackageModuleName}' { ${typeDef.replace(/([\s])declare /gm, '$1')} }`;
    const PackageModuleTypeDefPath = '/shim.d.ts';

    const templateCode = `
import { is, createIs } from 'ts-transform-runtime-check'

// use \`is\` to check a primitive
const number = 42;

// since the types are staticly known the check is evaluated at transform time
const isNumber    = is<number>(number);
const isString = is<string>(number);

// when the input type is of an unknown type (any | unknown) the check will be generated
const checkedIsNumber = is<number>(number as unknown);
const checkedIsBoolean = is<boolean>(number as unknown);

// of course primitives are not that interesting, lets try an interface

// We have some kind of user interface
interface User {
    id: number;
    name: string;
    age?: number;
}

// and a function to fetch data which should be a user, but we don't know for sure
declare function fetchData(): Promise<unknown>;

// we can wrap the function and use \`is<User>\` to make sure the data is valid
function fetchUser(): Promise<User> {
    return fetchData().then((data) => {
        // check if the data actually is of type User
        if (!is<User>(data)) {
            return Promise.reject('invalid data');
        }
        // data is a valid User value
        return data;
    });
}

// we can also use a simple helper function to create type guards
const isUser = createIs<User>();

let maybeUser!: unknown;

if (isUser(maybeUser)) {
    // its safe to treat \`maybeUser\` as a User
    const age = maybeUser.age;
}
`;

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

            const p = ds.p(`
This plugin showcases the features of <a href="https://github.com/kevinramharak/ts-transform-runtime-check" rel="noopener" target="_blank">ts-transform-runtime-check</a>.
`);

            const template = ds.button({
                label: 'show an example!',
                onclick() {
                    sandbox.setText(templateCode);
                },
            });

            template.style.marginRight = '8px';

            const button = ds.button({
                label: 'run transformer',
            });

            button.style.marginBottom = '16px';

            const code = ds.code('');

            /** get the compiler options */
            const compilerOptions = sandbox.getCompilerOptions();
            const fs = await tsvfs.createDefaultMapFromCDN(compilerOptions, ts.version, true, ts);
            fs.set(PackageModuleTypeDefPath, PackageModuleTypeDef);

            const errorInfo = ds.p('');

            function githubIssueTemplate(code: string, message: string, stack: string) {
                return `https://github.com/kevinramharak/playground-ts-transform-runtime-check/issues/new?title=${encodeURIComponent(`Playground Error: ${message}`)}&body=` + encodeURIComponent(`
Trying out the playground plugin with the code:

\`\`\`ts
${code.trim()}
\`\`\`

I got the following error while transforming:
\`\`\`
${stack}
\`\`\`
`);
            }

            function displayError(e: any) {
                console.error(e);
                if (e instanceof Error) {
                    code.innerHTML = e.stack || e.message;
                errorInfo.innerHTML = `
An error occured while trying to transform your code <br />
If it keeps occuring you can try and file an <a href="${githubIssueTemplate(sandbox.getText(), e.message, e.stack || '')}" target="_blank">issue</a>. <br />
It will be appreciated :)
`;
                } else {
                    code.innerHTML = e.toString();
                    errorInfo.innerText = 'An error occured while trying to transform your code, but its not an instanceof Error, who even does that';
                }
            }

            button.addEventListener('click', () => {
                errorInfo.innerText = '';
                try {
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
    
                    sandbox.monaco.editor.colorize(result, 'typescript', { tabSize: 4 }).then(result => {
                        code.innerHTML = result;
                    }).catch(e => {
                        console.error(e);
                        errorInfo.innerText = `Something went wrong while asking monaco to highlight the code, see the console if you need to see the error`;
                        code.innerHTML = result;
                    });
                } catch (e) {
                    displayError(e);
                }
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
