import {useState} from 'react';
import {useExportDraft} from './ui/exportDraft';
import type {ConfigSource} from '../../../src/api/model';
import {applyContent, type Connection} from './api';
import {validateContent} from './config';
import {useTask} from './state';
import {useNoticeToast} from './ui';
import {DraftBar} from './ui/DraftBar';
import {useDraftGuard} from './ui/draftGuard';
import {DraftPresence} from './ui/motion/DraftPresence';
import {ReviewDialog} from './ui/ReviewDialog';

export function useFeatureDraft(connection: Connection, source: ConfigSource | undefined, setBusy: (busy: boolean) => void, reload: () => Promise<unknown>) {
  const [draft, setDraft] = useState<{source: ConfigSource; content: string; summary: Record<string, string>}>();
  const [reviewing, setReviewing] = useState(false);
  const task = useTask(setBusy);
  const dirty = !!draft && draft.source.content !== draft.content;
  useDraftGuard(dirty, () => setDraft(undefined));
  useExportDraft(draft?.source, dirty, () => draft!.content);
  useNoticeToast(task.notice);
  const stage = (content: string, key: string, summary: string) => {
    if (source)
      setDraft(previous => {
        const base = previous?.source ?? source;
        return content === base.content ? undefined : {source: base, content, summary: {...previous?.summary, [key]: summary}};
      });
  };
  return {
    dirty,
    stage,
    busy: task.busy !== null,
    content: draft?.content ?? source?.content ?? '',
    footer: (
      <DraftPresence>
        {dirty && draft ? (
          <DraftBar
            count={Object.keys(draft.summary).length}
            discard={() => setDraft(undefined)}
            pending={task.busy !== null}
            review={() =>
              void task.run('validate', async () => {
                await validateContent(connection, draft.source, draft.content);
                setReviewing(true);
                return undefined;
              })
            }
          />
        ) : undefined}
      </DraftPresence>
    ),
    review: (
      <ReviewDialog
        open={reviewing}
        close={() => setReviewing(false)}
        pending={task.busy !== null}
        notice={task.notice}
        summary={Object.values(draft?.summary ?? {})}
        before={draft?.source.content ?? ''}
        after={draft?.content ?? ''}
        confirm={() =>
          void task.run('apply', async () => {
            if (!draft) return;
            await applyContent(connection, draft.source, draft.content);
            setDraft(undefined);
            try {
              await reload();
            } finally {
              setReviewing(false);
            }
            return {key: 'changesSaved'};
          })
        }
      />
    )
  };
}
