import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ipcLink } from 'electron-trpc/renderer';
import { trpc } from '@/utils/trpc';

export const trpcClient = trpc.createClient({
  links: [ipcLink()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst'
    },
    mutations: {
      networkMode: 'offlineFirst'
    }
  }
})

export default function ProviderInjector({ children }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  )
}