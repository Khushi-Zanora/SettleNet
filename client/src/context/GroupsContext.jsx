import { createContext, useContext, useMemo } from 'react';
import { useFetch } from '../hooks/useFetch';

const GroupsContext = createContext(null);

export function GroupsProvider({ children }) {
  const { data, error, loading, reload } = useFetch('/groups');

  const value = useMemo(
    () => ({
      groups: data ? data.groups : [],
      totals: data ? data.totals : null,
      loading: loading && !data, // only "loading" on the first load; reloads keep the old list visible
      error,
      reload,
    }),
    [data, error, loading, reload]
  );
  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export const useGroups = () => useContext(GroupsContext);