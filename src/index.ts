/// <reference path="./index.d.ts" />

import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground"

import runtimeCheck from 'ts-transform-runtime-check';

const makePlugin = (utils: PluginUtils) => {
    const customPlugin: PlaygroundPlugin = {
        id: "ts-transform-runtime-check",
        displayName: "Runtime Check",
        didMount: (sandbox, container) => {
            const ds = utils.createDesignSystem(container);

            ds.title("Runtime Check");

            const startButton = document.createElement("input");
            startButton.type = "button";
            startButton.value = "Run the transformer";
            container.appendChild(startButton);

            const ts = sandbox.ts;

            startButton.onclick = async () => {
                const program = await sandbox.createTSProgram();
                const sourceFile = program.getSourceFile(sandbox.filepath);
                const options = sandbox.getCompilerOptions();

                const output: { text: string, filename: string }[] = [];

                const result = program.emit(sourceFile, (filename, text) => {
                    output.push({ filename, text });
                }, void 0, false, { before: [runtimeCheck(program)] });
                
                console.log(output);
            };
        },

        // This is called occasionally as text changes in monaco,
        // it does not directly map 1 keyup to once run of the function
        // because it is intentionally called at most once every 0.3 seconds
        // and then will always run at the end.
        modelChangedDebounce: async (_sandbox, _model) => {
            // Do some work with the new text
        },

        // Gives you a chance to remove anything set up,
        // the container itself if wiped of children after this.
        didUnmount: () => {

        },
    }

    return customPlugin
}

export default makePlugin
