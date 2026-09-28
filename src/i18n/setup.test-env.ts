import {languages, loadLanguage} from './index';

// Unit tests render in every language; the app itself loads only the one it shows.
await Promise.all(languages.map(language => loadLanguage(language.id)));
