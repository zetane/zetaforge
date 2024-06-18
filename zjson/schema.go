package zjson

type BlockInformation struct {
	Id             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	SystemVersions []string `json:"system_versions"`
	BlockVersion   string   `json:"block_version"`
	BlockSource    string   `json:"block_source"`
	BlockType      string   `json:"block_type"`
}

type PipelineInformation struct {
	Name           string `json:"name"`
	Description    string `json:"description"`
	SystemVersions string `json:"system_versions"`
	Source         string `json:"source"`
	Type           string `json:"type"`
}

type Connection struct {
	Block    string `json:"block"`
	Variable string `json:"variable"`
}

type Put struct {
	Type        string       `json:"type"`
	Connections []Connection `json:"connections"`
	Relays      []Connection `json:"relays,omitempty"`
}

type Container struct {
	Image       string   `json:"image"`
	Version     string   `json:"version"`
	CommandLine []string `json:"command_line"`
}

type Action struct {
	Container  Container            `json:"container,omitempty"`
	Pipeline   map[string]Block     `json:"pipeline,omitempty"`
	Parameters map[string]Parameter `json:"parameters,omitempty"`
}

type TitleBar struct {
	BackgroundColor string `json:"background_color,omitempty"`
}

type Preview struct {
	Active  string `json:"active,omitempty"`
	Content string `json:"content,omitempty"`
}

type Node struct {
	Active   string              `json:"active"`
	TitleBar TitleBar            `json:"title_bar"`
	Preview  Preview             `json:"preview"`
	Html     string              `json:"html"`
	PosX     string              `json:"pos_x"`
	PosY     string              `json:"pos_y"`
	PosZ     string              `json:"pos_z"`
	Behavior string              `json:"behavior,omitempty"`
	Order    map[string][]string `json:"order,omitempty"`
}

type Views struct {
	Node Node   `json:"node"`
	Mode string `json:"mode,omitempty"`
}

type Parameter struct {
	Value string `json:"value"`
	Type  string `json:"type"`
}

type Event struct {
	Inputs  map[string]string `json:"inputs,omitempty"`
	Outputs map[string]string `json:"outputs,omitempty"`
	Log     []string          `json:"log,omitempty"`
}

type Block struct {
	Information BlockInformation `json:"information"`
	Inputs      map[string]Put   `json:"inputs"`
	Outputs     map[string]Put   `json:"outputs"`
	Action      Action           `json:"action"`
	Views       Views            `json:"views,omitempty"`
	Events      Event            `json:"events"`
}

type Pipeline struct {
	Id       string           `json:"id"`
	Name     string           `json:"name"`
	Pipeline map[string]Block `json:"pipeline"`
	Sink     string           `json:"sink"`
	Build    string           `json:"build"`
}

type Execution struct {
	Id       string   `json:"id"`
	Pipeline Pipeline `json:"pipeline"`
	Build    bool     `json:"build"`
}
