import { type Dialect, type Issue } from './check';
import { type Request, type Response } from './worker';

/** What the editor needs from a proofreader. Tests give it one that runs in place. */
export interface Checker {
  /** Spelling; with `review`, grammar and style too. */
  check(texts: string[], review: boolean): Promise<Issue[][]>;
  suggest(word: string): Promise<string[]>;
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type Ask = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never;

/** Talks to the proofreader's worker. Answers come back in the order they were asked. */
export class WorkerChecker implements Checker {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private next = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<Response>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if ('error' in e.data) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    };
  }

  private ask<T>(request: Ask): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  /** Loads a dictionary and adds the writer's own words and the story's names to it. */
  configure(dialect: Dialect, words: string[], names: string[]): Promise<void> {
    return this.ask({ type: 'configure', dialect, words, names });
  }

  check(texts: string[], review: boolean): Promise<Issue[][]> {
    return this.ask({ type: 'check', texts, review });
  }

  suggest(word: string): Promise<string[]> {
    return this.ask({ type: 'suggest', word });
  }

  destroy(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('The proofreader was closed.'));
    this.pending.clear();
  }
}
