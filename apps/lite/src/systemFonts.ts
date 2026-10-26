// The shared API's selector helpers reach doona's optional font loader; lite uses system fonts only.
export const loadFaces = (_fonts: string | null): Promise<void> => Promise.resolve();
