import {Dropdown, Button, Loading} from '@carbon/react'
import {useAtom} from 'jotai'
import { useImmerAtom } from "jotai-immer";
import ClosableModal from './ClosableModal';
import { choosenKubeContexts, availableKubeContexts, runningKubeContext, kubeErrors} from '@/atoms/kubecontextAtom'
import { defaultAnvilConfigurationAtom } from '@/atoms/anvilConfigurationsAtom';
import { useState, useEffect } from 'react'
import axios from 'axios'
import {trpc} from '@/utils/trpc'
import { useImmer } from 'use-immer';
export default function KubecontextModal({isPackaged, initialLaunch}) {
  const [showModal, setShowModal] = useState(false)
  const [availableKubeContextsAtom, setAvailableKubeContexts] = useAtom(availableKubeContexts)
  const [allKubecontexts, setAllKubeContexts] = useState([])
  const [defaultAnvilConfiguration] = useAtom(defaultAnvilConfigurationAtom)
  const [currentKubeContext, setCurrentKubeContext] = useImmerAtom(choosenKubeContexts)
  const [currentRunningKubeContext, setCurrentRunningKubeContext] = useAtom(runningKubeContext)
  const [errValidMessages, setErrMessage] = useAtom(kubeErrors)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setIsLoading] = useState(false)
  useEffect(() => {
    const serverAddress = import.meta.env.VITE_EXPRESS
        if(availableKubeContextsAtom.length === 0) {
            axios.get(`${serverAddress}/get-kube-contexts`).then((res) => {
                console.log("CHECK KUBES")
                console.log(res.data)
                setAvailableKubeContexts(res.data)
            }
            )
        }
  }, [])
  

  const submit = async () => {
    setIsLoading(true)
    const serverAddress = import.meta.env.VITE_EXPRESS

    console.log("SUBMIT")
    console.log(currentKubeContext)
    const reqBody = {
        host: defaultAnvilConfiguration.host,
        anvilPort: defaultAnvilConfiguration.anvilPort,
        KubeContext: currentKubeContext,
        s3Port: defaultAnvilConfiguration.s3Port,
    }
    
    try {
        const executeAnvil = await axios.post(`${serverAddress}/launch-anvil`, reqBody)
        if(executeAnvil.status !== 200) {
            console.log("ERROR CREAATING ANVIL EXEC")
            setIsLoading(false)
        } else{
            console.log("ANVIL LAUNCH SUCCESSFULLLLLLLL")
            setIsLoading(false)
        }
        console.log("ERROR LAUNCH ANVIL HERE")
        setIsLoading(false)
    } catch(err) {
        console.log("ERROR LAUNCH ANVIL")
        console.log(err.response.data)
        const errorData = err.response.data
        const errorMessages = [errorData?.err, errorData?.kubeErr]
        console.log(errorMessages)
        setErrMessage(errorMessages)
        setIsOpen(true)
        setIsLoading(false)

    }

  }

  const handleSelection = async (e) => {
    try{
    setCurrentKubeContext(draft => {
        return e.selectedItem
    })
    } catch (err) {
        console.log(err)
    }
  }

  

return (   <>
          <Dropdown items={availableKubeContextsAtom} onChange={handleSelection}/>
          <Button onClick={submit} disabled={!isPackaged || currentKubeContext == ''} >
            <Loading active={loading} />
            Save & Relaunch
            </Button>
          
          <div className='err-modal'>
          <ClosableModal
        modalHeading="The following error(s) occurred:"
        passiveModal={true}
        open={isOpen}
        onRequestClose={() => setIsOpen(false)}
      >
        <div className="flex flex-col gap-4 p-3">
          {errValidMessages.map((error, i) => {
            return (
              <p key={"error-msg-" + i}>{error}</p>
            )
          })}
        </div>
      </ClosableModal>
      </div>
          </>
        )


}