declare module 'picomatch' {
  interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
    matchBase?: boolean;
    [key: string]: unknown;
  }

  function picomatch(glob: string | string[], options?: PicomatchOptions): (str: string) => boolean;
  namespace picomatch {
    function isMatch(str: string | string[], glob: string | string[], options?: PicomatchOptions): boolean;
  }

  export = picomatch;
}
