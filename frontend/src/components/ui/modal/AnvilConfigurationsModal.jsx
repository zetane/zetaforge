import {
  defaultAnvilConfigurationAtom,
  userAnvilConfigurationsAtom,
  addConfigurationAtom,
  removeConfigurationAtom,
  activeIndexAtom,
} from "@/atoms/anvilConfigurationsAtom";
import {
  Button,
  NumberInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectRow,
  TextInput,
} from "@carbon/react";
import { useAtom } from "jotai";
import ClosableModal from "./ClosableModal";
import { Add, TrashCan } from "@carbon/icons-react";
import { useState } from "react";
import LaunchAnvilButton from "./LaunchAnvilButton";

export default function AnvilConfigurationsModal() {
  const [defaultAnvilConfiguration] = useAtom(defaultAnvilConfigurationAtom);
  const [userAnvilConfigurations] = useAtom(userAnvilConfigurationsAtom);

  const defaultRows = [defaultAnvilConfiguration].map((c) => ({
    configuration: c,
    deletable: false,
  }));
  const userRows = userAnvilConfigurations.map((c, i) => ({
    configuration: c,
    removeable: true,
    removeIndex: i,
  }));
  const rows = [...defaultRows, ...userRows].map((r, i) => ({
    ...r,
    selectIndex: i,
  }));

  return (
    <ClosableModal modalHeading="Anvil Configurations" size="md" passiveModal>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader />
            <TableHeader>Name</TableHeader>
            <TableHeader>Host</TableHeader>
            <TableHeader>Anvil Port</TableHeader>
            <TableHeader>S3 Port</TableHeader>
            <TableHeader />
          </TableRow>
        </TableHead>
        <TableBody>
          <ConfigRows rows={rows} />
          <AddRow />
        </TableBody>
      </Table>
      <LaunchAnvilButton />
    </ClosableModal>
  );
}

function ConfigRows({ rows }) {
  return rows.map((r, i) => <ConfigRow key={i} {...r} />);
}

function ConfigRow({ configuration, removeable, removeIndex, selectIndex }) {
  const [, removeConfiguration] = useAtom(removeConfigurationAtom);
  const [active, setActive] = useAtom(activeIndexAtom);

  function handleRemoveConfiguration() {
    removeConfiguration(removeIndex);
  }

  function handleSelectConfiguration() {
    setActive(selectIndex);
  }

  return (
    <TableRow>
      <TableSelectRow
        radio
        checked={active == selectIndex}
        onSelect={handleSelectConfiguration}
      />
      <ConfigCells configuration={configuration} />
      {removeable ? (
        <TableCell>
          <Button
            onClick={handleRemoveConfiguration}
            renderIcon={TrashCan}
            hasIconOnly
            iconDescription="Remove"
            tooltipAlignment="end"
            kind="ghost"
            size="sm"
          />
        </TableCell>
      ) : (
        <TableCell />
      )}
    </TableRow>
  );
}

function ConfigCells({ configuration }) {
  return Object.keys(configuration).map((k) => (
    <TableCell key={k}>{configuration[k]}</TableCell>
  ));
}

function AddRow() {
  const [, addConfig] = useAtom(addConfigurationAtom);
  const [config, setConfig] = useState({
    name: "",
    host: "",
    anvilPort: 0,
    s3Port: 0,
  });

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      addConfig(config);
    }
  }

  function handleAddConfiguration() {
    addConfig(config);
  }

  function handleInputChange(key, value) {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <TableRow onKeyDown={handleKeyDown}>
      <TableCell />
      <TableCell>
        <TextInput
          size="sm"
          value={config.name}
          onChange={(e) => handleInputChange("name", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <TextInput
          size="sm"
          alue={config.host}
          onChange={(e) => handleInputChange("host", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <NumberInput
          size="sm"
          allowEmpty
          hideSteppers
          min={0}
          max={65535}
          value={config.anvilPort}
          onChange={(e) => handleInputChange("anvilPort", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <NumberInput
          size="sm"
          allowEmpty
          hideSteppers
          min={0}
          max={65535}
          value={config.s3Port}
          onChange={(e) => handleInputChange("s3Port", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Button
          onClick={handleAddConfiguration}
          renderIcon={Add}
          hasIconOnly
          iconDescription="Add"
          tooltipAlignment="end"
          kind="ghost"
          size="sm"
        />
      </TableCell>
    </TableRow>
  );
}
