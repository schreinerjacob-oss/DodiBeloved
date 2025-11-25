import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Pure P2P app - no server API calls
// All data is stored and synced locally in encrypted IndexedDB via P2P connections

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// DEPRECATED - Kept for backward compatibility but should not be used
// All data operations use encrypted local storage + P2P sync
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  console.warn('apiRequest called - this should not happen in pure P2P mode');
  throw new Error('No backend server - use local encrypted storage instead');
}

// DEPRECATED - Kept for backward compatibility but should not be used
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    console.warn('getQueryFn called - this should not happen in pure P2P mode');
    throw new Error('No backend server - use local encrypted storage instead');
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
