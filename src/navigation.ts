export type Page =
  | "spin"
  | "collection"
  | "auction"
  | "scanner"
  | "quests"
  | "profile"
  | "more"
  | "themes"
  | "events"
  | "leaderboard"
  | "achievements"
  | "sets"
  | "admin"
  | "quick"
  | "promo"
  | "records"
  | "history";
export type Route = {
  page: Page;
  filter: string;
  publicId: string | null;
  scroll: number;
};
export type Navigation = { current: Route; stack: Route[] };
export const initialNavigation: Navigation = {
  current: { page: "spin", filter: "all", publicId: null, scroll: 0 },
  stack: [],
};
export function pushRoute(
  nav: Navigation,
  page: Page,
  scroll: number,
  options: Partial<Pick<Route, "filter" | "publicId">> = {},
): Navigation {
  const next: Route = {
    page,
    filter: options.filter ?? "all",
    publicId: options.publicId ?? null,
    scroll: 0,
  };
  if (
    next.page === nav.current.page &&
    next.filter === nav.current.filter &&
    next.publicId === nav.current.publicId
  )
    return nav;
  return {
    current: next,
    stack: [...nav.stack, { ...nav.current, scroll }].slice(-50),
  };
}
export function popRoute(nav: Navigation): Navigation {
  if (!nav.stack.length) return nav;
  return {
    current: nav.stack[nav.stack.length - 1],
    stack: nav.stack.slice(0, -1),
  };
}
