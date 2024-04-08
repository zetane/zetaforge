import { useEffect, useState } from "react";
import { LogsCodeMirror } from "./CodeMirrorComponents";

const LogsViewer = ({ filePath, startFetching }) => {
  const [logs, setLogs] = useState("");
  const serverAddress = "http://localhost:3330";

  useEffect(() => {
    let interval;

    if (startFetching) {
      interval = setInterval(() => {
        fetch(`${serverAddress}/api/logs?filePath=${filePath}`)
          .then((response) => response.text())
          .then((data) => setLogs(data))
          .catch((err) => console.error(err));
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [filePath, startFetching]);

  return (
    <div className="code-container centered-container">
      <div className="viewer-container">
        <div className="logs-viewer">
          <LogsCodeMirror code={logs} />
        </div>
      </div>
    </div>
  );
};

export default LogsViewer;