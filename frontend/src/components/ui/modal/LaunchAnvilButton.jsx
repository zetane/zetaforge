import {Button} from '@carbon/react'
import { useAtom } from "jotai";
import {
    defaultAnvilConfigurationAtom,
    userAnvilConfigurationsAtom,
    activeConfigurationAtom
} from "@/atoms/anvilConfigurationsAtom"
import { useEffect, useState } from 'react';
export default function LaunchAnvilButton() {
    const [defaultAnvilConfiguration] = useAtom(defaultAnvilConfigurationAtom);
    const [userAnvilConfigurations] = useAtom(userAnvilConfigurationsAtom);
    const [disabled, setDisabled] = useState(false)
    const [activeConfiguration] = useAtom(activeConfigurationAtom)
    const divStyle = {
        paddingTop: '20px', // Adjust the padding as needed
        display: 'flex',
        justifyContent: 'flex', // Adjust the alignment as needed
        alignItems: 'flex', // Adjust the alignment as needed
      };
    
      
    
    const handleClick = async () => {
        const serverAddress = import.meta.env.VITE_EXPRESS
        
        console.log(activeConfiguration)
        await fetch(`${serverAddress}/launch-anvil-locally`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
              },
            body: JSON.stringify({ selectedConfig: activeConfiguration }),
            
        })
    }
    

    return (
        <div style={divStyle}>
    <Button onClick={handleClick} disabled={activeConfiguration.name !== 'Default'}>Launch Anvil</Button>
        </div>)
}



