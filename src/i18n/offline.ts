import {languages as registry, REFERENCE_LANG} from './languages';

// A file of the build as vite.config.ts hands it over: a catalogue chunk names its language, and every file lists the
// sources it was built from.
export interface BuiltFile {
  name: string;
  catalogue: string | null;
  sources: readonly string[];
}

// The files the service worker caches for each language once a reader uses it: the language's catalogue and the
// stylesheet that declares its faces, which several languages may share. A partial language loads the reference
// language with it, so its list holds the reference's files too.
export function languageFiles(
  files: readonly BuiltFile[],
  languages: ReadonlyArray<{id: string; fonts: string | null; complete: boolean}> = registry,
  reference: string = REFERENCE_LANG
): Record<string, string[]> {
  const own = (id: string) => {
    const {fonts} = languages.find(language => language.id === id)!;
    return files.filter(file => file.catalogue === id || (fonts !== null && file.sources.includes(`src/fonts-${fonts}.css`))).map(file => file.name);
  };
  return Object.fromEntries(languages.map(({id, complete}) => [id, complete ? own(id) : [...new Set([...own(id), ...own(reference)])].sort()]));
}
