import type ts from 'typescript';

declare module 'ts-transform-runtime-check' {
    const factory: (program: ts.Program) => ts.TransformerFactory<ts.SourceFile>;
    // @ts-ignore
    export default factory;
}
