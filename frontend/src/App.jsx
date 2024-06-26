import ProviderInjector from "@/components/ProviderInjector";
import BlockEditorPanel from "@/components/ui/BlockEditorPanel";
import DrawflowWrapper from "@/components/ui/DrawflowWrapper";
import ForgeTheme from "@/components/ui/ForgeTheme";
import MainContent from "@/components/ui/MainContent";
import Navbar from "@/components/ui/Navbar";
import LibraryFetcher from "@/components/ui/library/LibraryFetcher";
import LibrarySwitcher from "@/components/ui/library/LibrarySwitcher";
import ModalWrapper from "@/components/ui/modal/ModalWrapper";
import ToastWrapper from "./components/ui/ToastWrapper";
import "./styles/globals.scss";
import AnvilConfigurationsModal from "./components/ui/modal/AnvilConfigurationsModal";
import { useState, useEffect } from "react";
import axios from 'axios'
import { useAtom } from "jotai";
import { isPackaged} from "@/atoms/kubecontextAtom";
import InitialLaunchModal from "./components/ui/modal/InitialLaunchModal";
import { availableKubeContexts } from "@/atoms/kubecontextAtom";
export default function App() {

  
  const [appIsPackaged, setIsPackaged] = useAtom(isPackaged)
  const [availableKubeContextsAtom, setAvailableKubeContexts] = useAtom(availableKubeContexts)

  
  useEffect(() => {
    const serverAddress = import.meta.env.VITE_EXPRESS
    const res = axios.get(`${serverAddress}/isPackaged`).then((response) => {
      console.log(response)
      console.log(response.data)
      setIsPackaged(response.data)
      if(availableKubeContextsAtom.length === 0) {
        axios.get(`${serverAddress}/get-kube-contexts`).then((res) => {
            setAvailableKubeContexts(res.data)
        }
        )
    }
    })
    

    

  }, [])
 
  
  return (
    <ProviderInjector>
      <ForgeTheme>
        <Navbar>
          <LibraryFetcher />
          <BlockEditorPanel />
        </Navbar>
        <LibrarySwitcher />
        <InitialLaunchModal />
        <MainContent>
          <DrawflowWrapper />
        </MainContent>
        <ModalWrapper />
        <ToastWrapper />
      </ForgeTheme>
    </ProviderInjector>
  );
}
