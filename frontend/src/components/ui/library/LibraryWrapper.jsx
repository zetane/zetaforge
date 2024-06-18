import { libraryAtom } from '@/atoms/libraryAtom';
import { ArrowLeft } from "@carbon/icons-react";
import LibraryTile from './LibraryTile';
import LibraryPipelineTile from './LibraryPipelineTile';
import {
  ContainedList,
  FlexGrid,
  IconButton,
  Row,
  Search,
  SideNav,
  SideNavItems,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs
} from '@carbon/react';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';

export default function LibraryWrapper({ specs, pipelines }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [filteredPipelines, setFilteredPipelines] = useState([]);
  const [showLibrary, setShowLibrary] = useAtom(libraryAtom);

  const handleChange = (event) => {
    setSearchTerm(event.target.value);
  };

  useEffect(() => {
    const blockResults = specs.filter((spec) =>
      spec?.information?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setSearchResults(blockResults);

    const pipelineResults = pipelines.filter((pipeline) =>
      pipeline?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredPipelines(pipelineResults);
  }, [searchTerm, specs, pipelines]);

  const tileGrid = [];
  let rowGrid = [];
  searchResults.forEach((spec, index) => {
    let tile = <LibraryTile key={index} block={spec} index={index} />;
    rowGrid.push(tile);
    if (rowGrid.length === 3 || index === searchResults.length - 1) {
      tileGrid.push(<Row key={index}>{rowGrid}</Row>);
      rowGrid = [];
    }
  });

  const pipelineGrid = [];
  rowGrid = [];
  filteredPipelines.forEach((pipeline, index) => {
    let tile = <LibraryPipelineTile key={index} pipeline={pipeline} />;
    rowGrid.push(tile);
    if (rowGrid.length === 3 || index === filteredPipelines.length - 1) {
      pipelineGrid.push(<Row key={index}>{rowGrid}</Row>);
      rowGrid = [];
    }
  });

  let searchTitle = (
    <div style={{display: "flex"}}>
      <IconButton label="Close" kind="ghost" onClick={() => {setShowLibrary(false)}}>
        <ArrowLeft/>
      </IconButton>
      <div style={{alignItems: "center", display: "flex"}}>
        Block Library
      </div>
    </div>
  );

  return (
    <SideNav
      aria-label="Side navigation"
      expanded={showLibrary}
      isFixedNav>
      <SideNavItems>
        <ContainedList label={searchTitle} kind="on-page" action={''}>
          <Search
            placeholder="Search"
            value={searchTerm}
            onChange={handleChange}
            closeButtonLabelText="Clear search input"
            size="lg"
            labelText="Search"
          />
          <Tabs>
            <TabList fullWidth className="full-tabs" aria-label='Core blocks and pipelines'>
              <Tab>Core Blocks ({searchResults.length})</Tab>
              <Tab>Core Pipelines ({filteredPipelines.length})</Tab>
            </TabList>
            <TabPanels>
              <TabPanel className="library-tab library-tile-container">
              <FlexGrid fullWidth={true} condensed={true} className="mt-2">
                {tileGrid}
              </FlexGrid>
              </TabPanel>
              <TabPanel className="library-tab library-tile-container">
                <FlexGrid fullWidth={true} condensed={true} className="mt-2">
                  {pipelineGrid}
                </FlexGrid>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ContainedList>
      </SideNavItems>
    </SideNav>
  );
}
