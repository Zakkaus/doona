import {href} from '../../shell/route';

// The setup guide's sections in page order, then the subsections other pages link to directly. Explanations elsewhere
// link into the guide by these ids, so an id is renamed or removed only together with every link to it.
export const guideSections = ['requirements', 'install', 'config', 'doona', 'features', 'operation', 'troubleshooting'] as const;
export const guideSubsections = ['state-db', 'still-missing', 'read-only', 'unknown-setting', 'no-native-api', 'sign-in'] as const;
export const guideAnchors = [...guideSections, ...guideSubsections] as const;
export type GuideSection = (typeof guideSections)[number];
export type GuideSubsection = (typeof guideSubsections)[number];
export type GuideAnchor = (typeof guideAnchors)[number];

export const isGuideAnchor = (value: string | null): value is GuideAnchor => (guideAnchors as readonly string[]).includes(value ?? '');
// The element the guide scrolls to for `?section=`.
export const guideSectionId = (anchor: GuideAnchor) => `guide-${anchor}`;
export const guideHref = (anchor?: GuideAnchor) => href('guide', anchor ? {section: anchor} : {});
