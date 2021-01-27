import ts from 'typescript';
import bfs from 'browserfs';

import type { FSModule } from 'browserfs/dist/node/core/FS';

export type FileSystemType = keyof typeof bfs.FileSystem;
export type FileSystemConstructor<T extends FileSystemType> = typeof bfs['FileSystem'][T];
export type FileSystem<T extends FileSystemType> = ReturnType<FileSystemConstructor<T>['Create']>;
export interface FileSystemConfiguration<T extends FileSystemType> {
    fs: T;
    options?: any;
}

export interface GlobalHost {
    Buffer: typeof import('buffer');
    process: typeof import('process');
    require: typeof bfs.BFSRequire;
}

export function installBfs(host: Record<string, any> = {}): typeof host & GlobalHost {
    bfs.install(host);
    return host as any;
}

export function createRootFileSystem<T extends FileSystemType>(config: FileSystemConfiguration<T>): Promise<FileSystem<T>> {
    return new Promise((resolve, reject) => {
        bfs.getFileSystem(config as bfs.FileSystemConfiguration, (error, fs) => {
            if (error) {
                reject(error);
            } else {
                resolve(
                    bfs.initialize(fs as any) as any
                );
            }
        });
    });
}

type TS = typeof ts;

export const createBrowserFSBackedSystem = (global: GlobalHost, fs: FSModule): ts.System => {
    const newLine = '\n';
    const useCaseSensitiveFileNames = true;

    const encoding = 'utf-8';

    // NOTE: most of this is based on the ts.System that the typescript compiler uses in a node environment
    // NOTE: we take ts/vfs as a guide to implement the minimum amount to make the playground version work
    // see: src/compiler/sys.ts#1136

    const system: ts.System = {
        args: [],
        newLine,
        useCaseSensitiveFileNames,
        write(string: string) {
            console.log(string);
        },
        writeOutputIsTTY: () => false,
        readFile(path: string) {
            return fs.readFileSync(path, { encoding });
        },
        writeFile(path: string, content: string) {
            fs.writeFileSync(path, content, { encoding });
        },
        resolvePath: path => path,
        fileExists(path: string) {
            try {
                const stat = fs.statSync(path);
                if (stat && stat.isFile()) {
                    return true;
                }
            } catch (e) { }
            return false;
        },
        directoryExists(path: string) {
            try {
                const stat = fs.statSync(path);
                if (stat && stat.isDirectory()) {
                    return true;
                }
            } catch (e) { }
            return false;
        },
        createDirectory(path: string) {
            if (!system.directoryExists(path)) {
                try {
                    fs.mkdirSync(path)
                } catch (e) {
                    if (e.code !== 'EEXIST') {
                        throw e;
                    }
                }
            }
        },
        getCurrentDirectory() {
            // NOTE: uses a browser shim, value should be '/'
            return global.process.cwd();
        },
        getDirectories(path: string) {
            try {
                return fs.readdirSync(path);
            } catch (e) {
                return [];
            }
        },
        readDirectory(path: string, extensions?, exclude?, include?, depth?) {
            // TODO: implement this, the ts version looks pretty complicated
            return [];
        },
        exit(code?) {
            // NOTE: maybe ignore this instead?, doubt the shim does anything interesting
            return global.process.exit(code);
        },
        getExecutingFilePath() {
            return system.getCurrentDirectory();
        },
    };

    return system;
};

export const createBrowserFSCompilerHost = (global: GlobalHost, system: ts.System, compilerOptions: ts.CompilerOptions, ts: TS): ts.CompilerHost => {
    const host: ts.CompilerHost = {
        ...system,
        getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
            // NOTE: taken straight from `src/program.ts#77`
            let text: string | undefined;
            try {
                text = host.readFile(fileName);
            }
            catch (e) {
                if (onError) {
                    onError(e.message);
                }
                text = "";
            }
            return text !== undefined ? ts.createSourceFile(fileName, text, languageVersion, false) : undefined;
        },
        getDefaultLibFileName() {
            return host.getDefaultLibLocation!() + ts.getDefaultLibFileName(compilerOptions);
        },
        getDefaultLibLocation() {
            return system.getCurrentDirectory() + 'libs/';
        },
        getCanonicalFileName(fileName) {
            return fileName;
        },
        getNewLine() {
            return system.newLine;
        },
        useCaseSensitiveFileNames() {
            return system.useCaseSensitiveFileNames;
        },
        resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, options) {
            const modules = system.getDirectories('node_modules');
            return moduleNames.map(name => {
                if (modules.indexOf(name) !== -1) {
                    return {
                        resolvedFileName: `node_modules/${name}/index.d.ts`,
                        extension: '.ts',
                        packageId: {
                            name,
                            subModuleName: '',
                            version: '0.0.0-alpha5',
                        },
                    } as ts.ResolvedModuleFull;
                }
            }) as (ts.ResolvedModuleFull | undefined)[];
            // return {
            //     resolvedFileName: 'node_modules/ts-transform-runtime-check/index.d.ts',
            //     isExternalLibraryImport: true,
            //     extension: '.ts',
            //     packageId: {
            //         name: 'ts-transform-runtime-check',
            //         subModuleName: '',
            //         version: '0.0.0-alpha5',
            //     },
            // } as ts.ResolvedModuleFull;
        }
    };

    return host;
};
