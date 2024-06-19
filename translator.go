package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"

	"server/zjson"

	wfv1 "github.com/argoproj/argo-workflows/v3/pkg/apis/workflow/v1alpha1"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/go-cmd/cmd"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type Catalog struct {
	Repositories []string `json:"repositories"`
}

type TagList struct {
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

func checkImage(ctx context.Context, tag string, cfg Config) (bool, error) {
	if cfg.IsLocal {
		if cfg.Local.Driver == "minikube" {
			minikubeImage := cmd.NewCmd("minikube", "-p", "zetaforge", "image", "ls")
			<-minikubeImage.Start()
			for _, line := range minikubeImage.Status().Stdout {
				if "docker.io/"+tag == line {
					return true, nil
				}
			}
			return false, nil
		} else {
			apiClient, err := client.NewClientWithOpts(
				client.WithAPIVersionNegotiation(),
			)
			if err != nil {
				return false, err
			}
			defer apiClient.Close()

			imageList, err := apiClient.ImageList(ctx, types.ImageListOptions{})
			if err != nil {
				return false, err
			}

			for _, image := range imageList {
				for _, tagName := range image.RepoTags {
					if tag == tagName {
						return true, nil
					}
				}

			}

			return false, nil
		}
	} else if cfg.Cloud.IsDebug {
		response, err := http.Get(fmt.Sprintf("http://localhost:%d/v2/_catalog", cfg.Cloud.RegistryPort))
		if err != nil {
			return false, err
		}

		defer response.Body.Close()

		body, err := io.ReadAll(response.Body)
		if err != nil {
			return false, err
		}

		var catalog Catalog
		if err := json.Unmarshal(body, &catalog); err != nil {
			return false, err
		}

		for _, name := range catalog.Repositories {
			response, err := http.Get(fmt.Sprintf("http://localhost:%d/v2/%s/tags/list", cfg.Cloud.RegistryPort, name))
			if err != nil {
				return false, err
			}

			defer response.Body.Close()
			body, err := io.ReadAll(response.Body)
			if err != nil {
				return false, err
			}
			var tagList TagList
			if err := json.Unmarshal(body, &tagList); err != nil {
				return false, err
			}
			for _, tagName := range tagList.Tags {
				expectedTagName := fmt.Sprintf("localhost:5000/%s:%s", name, tagName)
				if tag == expectedTagName {
					return true, nil
				}
			}
		}

		return false, nil
	} else {
		repo, err := name.NewRepository(registryAddress(cfg))
		if err != nil {
			return false, err
		}

		data, err := remote.List(repo, remote.WithAuth(registryAuth(cfg)))

		if err != nil {
			return false, err
		}

		for _, tagName := range data {
			if tag == registryAddress(cfg)+":"+tagName {
				return true, nil
			}
		}

		return false, nil
	}
}

func blockTemplate(block *zjson.Block, blockKey string, organization string, key string, cfg Config) *wfv1.Template {
	image := getImage(block)
	if cfg.IsLocal {
		image = "zetaforge/" + image
	} else {
		image = fmt.Sprintf("localhost:%d/%s", cfg.Cloud.RegistryPort, image)
		image = registryAddress(cfg) + ":" + organization + "-" + block.Action.Container.Image + "-" + block.Action.Container.Version
	}

	computationName := getComputationName(blockKey, organization, cfg)
	entrypoint := wfv1.Artifact{
		Name: "entrypoint",
		Path: cfg.WorkDir + "/" + cfg.EntrypointFile,
		ArtifactLocation: wfv1.ArtifactLocation{
			S3: &wfv1.S3Artifact{
				Key: cfg.EntrypointFile,
			},
		},
		Archive: &wfv1.ArchiveStrategy{
			None: &wfv1.NoneStrategy{},
		},
	}
	computations := wfv1.Artifact{
		Name: "computations",
		Path: cfg.WorkDir + "/" + cfg.ComputationFile,
		ArtifactLocation: wfv1.ArtifactLocation{
			S3: &wfv1.S3Artifact{
				Key: key + "/" + computationName,
			},
		},
		Archive: &wfv1.ArchiveStrategy{
			None: &wfv1.NoneStrategy{},
		},
	}
	idMap := make(map[string]string)
	idMap["key"] = blockKey
	return &wfv1.Template{
		Name: blockKey,
		Container: &corev1.Container{
			Image:           image,
			Command:         block.Action.Container.CommandLine,
			ImagePullPolicy: "IfNotPresent",
		},
		Inputs:   wfv1.Inputs{Artifacts: []wfv1.Artifact{entrypoint, computations}},
		Metadata: wfv1.Metadata{Annotations: idMap},
	}
}

func kanikoTemplate(block *zjson.Block, organization string, cfg Config) *wfv1.Template {
	if cfg.IsLocal {
		return nil
	} else if cfg.Cloud.IsDebug {
		name := getKanikoTemplateName(block, organization)
		tag := getImage(block)
		image := fmt.Sprintf("registry:%d/%s", cfg.Cloud.RegistryPort, tag)
		cmd := []string{
			"/kaniko/executor",
			"--context",
			"dir:///workspace/context",
			"--destination",
			image,
			"--insecure",
			"--compressed-caching=false",
			"--snapshotMode=redo",
			"--use-new-run",
		}
		artifact := wfv1.Artifact{
			Name: "context",
			Path: "/workspace/context",
			ArtifactLocation: wfv1.ArtifactLocation{
				S3: &wfv1.S3Artifact{
					Key: getKanikoBuildContextS3Key(block, organization),
				},
			},
			Archive: &wfv1.ArchiveStrategy{
				None: &wfv1.NoneStrategy{},
			},
		}
		return &wfv1.Template{
			Name: name + "-build",
			Container: &corev1.Container{
				Image:   cfg.KanikoImage,
				Command: cmd,
			},
			Inputs: wfv1.Inputs{Artifacts: []wfv1.Artifact{artifact}},
		}
	} else {
		name := getKanikoTemplateName(block, organization)
		image := cfg.Cloud.RegistryAddr + ":" + getImage(block)
		cmd := []string{
			"/kaniko/executor",
			"--context",
			"tar:///workspace/context.tar.gz",
			"--destination",
			registryAddress(cfg) + ":" + name,
			"--compressed-caching=false",
			"--snapshotMode=redo",
			"--use-new-run",
		}
		return &wfv1.Template{
			Name: name + "-build",
			Container: &corev1.Container{
				Image:   cfg.KanikoImage,
				Command: cmd,
				VolumeMounts: []corev1.VolumeMount{
					{
						Name:      "kaniko-secret",
						MountPath: "/kaniko/.docker",
					},
				},
			},
			Inputs: wfv1.Inputs{Artifacts: []wfv1.Artifact{
				{
					Name: "context",
					Path: "/workspace/context",
					ArtifactLocation: wfv1.ArtifactLocation{
						S3: &wfv1.S3Artifact{
							Key: getKanikoBuildContextS3Key(block, organization),
						},
					},
					Archive: &wfv1.ArchiveStrategy{
						None: &wfv1.NoneStrategy{},
					},
				},
			}},
			Volumes: []corev1.Volume{
				{
					Name: "kaniko-secret",
					VolumeSource: corev1.VolumeSource{
						Secret: &corev1.SecretVolumeSource{
							SecretName: cfg.Cloud.Registry,
							Items: []corev1.KeyToPath{
								{
									Key:  ".dockerconfigjson",
									Path: "config.json",
								},
							},
						},
					},
				},
			},
		}
	}

}

func translate(ctx context.Context, pipeline *zjson.Pipeline, organization string, key string, build bool, cfg Config) (*wfv1.Workflow, map[string]string, error) {
	workflow := wfv1.Workflow{
		TypeMeta: metav1.TypeMeta{
			Kind:       "Workflow",
			APIVersion: "argoproj.io/v1alpha1",
		},
		ObjectMeta: metav1.ObjectMeta{
			GenerateName:      pipeline.Id + "-",
			CreationTimestamp: metav1.Now(),
		},
		Spec: wfv1.WorkflowSpec{
			ArtifactRepositoryRef: &wfv1.ArtifactRepositoryRef{
				ConfigMap: cfg.Bucket,
				Key:       "default",
			},
			Entrypoint:         "DAG",
			ServiceAccountName: cfg.ServiceAccount,
		},
	}

	blocks := make(map[string]string)
	tasks := make(map[string]*wfv1.DAGTask)
	templates := make(map[string]*wfv1.Template)
	for id, block := range pipeline.Pipeline {
		blockKey := id
		template := blockTemplate(&block, blockKey, organization, key, cfg)
		task := wfv1.DAGTask{Name: template.Name, Template: template.Name}

		if len(block.Action.Container.Image) > 0 {
			kaniko := kanikoTemplate(&block, organization, cfg)
			built, err := checkImage(ctx, template.Container.Image, cfg)
			if err != nil {
				return &workflow, blocks, err
			}

			blockPath := filepath.Join(pipeline.Build, blockKey)
			blocks[blockPath] = ""
			if build || !built {
				if cfg.IsLocal {
					blocks[blockPath] = "zetaforge/" + block.Action.Container.Image + ":" + block.Action.Container.Version
				} else {
					blocks[blockPath] = block.Action.Container.Image + "-" + block.Action.Container.Version
					templates[kaniko.Name] = kaniko
					tasks[kaniko.Name] = &wfv1.DAGTask{Name: kaniko.Name, Template: kaniko.Name}
					task.Dependencies = append(task.Dependencies, kaniko.Name)
				}
			}

			template.Container.Env = append(template.Container.Env, corev1.EnvVar{
				Name:  "_blockid_",
				Value: blockKey,
			})
		}

		for name, input := range block.Inputs {
			if len(input.Connections) > 0 {
				if len(input.Connections) == 1 {
					connection := input.Connections[0]
					inputBlock := pipeline.Pipeline[connection.Block]
					param, ok := inputBlock.Action.Parameters[connection.Variable]
					// Parameter is in the graph
					if ok {
						template.Container.Env = append(template.Container.Env, corev1.EnvVar{
							Name:  name,
							Value: param.Value,
						})
					} else {
						template.Container.Env = append(template.Container.Env, corev1.EnvVar{
							Name:  name,
							Value: "{{inputs.parameters." + name + "}}",
						})
						template.Inputs.Parameters = append(template.Inputs.Parameters, wfv1.Parameter{
							Name: name,
						})
						inputNodeName := connection.Block
						task.Dependencies = append(task.Dependencies, inputNodeName)
						path := "{{tasks." + inputNodeName + ".outputs.parameters." + connection.Variable + "}}"
						task.Arguments.Parameters = append(task.Arguments.Parameters, wfv1.Parameter{
							Name:  name,
							Value: wfv1.AnyStringPtr(path),
						})
					}
				} else {
					// TODO
					return &workflow, blocks, errors.New("unsupported multiple inputs")
				}
			}
		}

		for name := range block.Outputs {
			blockVar := blockKey + "-" + name
			fullPath := cfg.FileDir + "/" + blockVar + ".txt"
			template.Outputs.Parameters = append(template.Outputs.Parameters, wfv1.Parameter{
				Name:      name,
				ValueFrom: &wfv1.ValueFrom{Path: fullPath},
			})
		}

		var filesName string
		if cfg.IsLocal || cfg.Cloud.IsDebug {
			filesName = key
		} else {
			filesName = organization + "/" + key
			workflow.Spec.ImagePullSecrets = []corev1.LocalObjectReference{
				{
					Name: cfg.Cloud.Registry,
				},
			}
		}

		template.Inputs.Artifacts = append(template.Inputs.Artifacts, wfv1.Artifact{
			Name: "in",
			Path: cfg.FileDir,
			ArtifactLocation: wfv1.ArtifactLocation{
				S3: &wfv1.S3Artifact{
					Key: filesName,
				},
			},
			Archive: &wfv1.ArchiveStrategy{
				None: &wfv1.NoneStrategy{},
			},
		})
		template.Outputs.Artifacts = append(template.Outputs.Artifacts, wfv1.Artifact{
			Name: "out",
			Path: cfg.FileDir,
			ArtifactLocation: wfv1.ArtifactLocation{
				S3: &wfv1.S3Artifact{
					Key: filesName,
				},
			},
			Archive: &wfv1.ArchiveStrategy{
				None: &wfv1.NoneStrategy{},
			},
		})

		tasks[task.Name] = &task
		templates[template.Name] = template
	}

	dag := wfv1.Template{
		Name: "DAG",
		DAG: &wfv1.DAGTemplate{
			Tasks: []wfv1.DAGTask{},
		},
	}

	for _, template := range templates {
		if len(template.Container.Command) > 0 {
			workflow.Spec.Templates = append(workflow.Spec.Templates, *template)
		}
	}

	for name, task := range tasks {
		if len(templates[name].Container.Command) > 0 {
			dag.DAG.Tasks = append(dag.DAG.Tasks, *task)
		}
	}

	workflow.Spec.Templates = append(workflow.Spec.Templates, dag)

	return &workflow, blocks, nil
}

func getImage(block *zjson.Block) string {
	return block.Action.Container.Image + ":" + block.Action.Container.Version
}

func getComputationName(blockKey string, organization string, cfg Config) string {
	if cfg.IsLocal || cfg.Cloud.IsDebug {
		return blockKey + ".py"
	} else {
		return organization + "-" + blockKey + ".py"
	}
}

func getKanikoTemplateName(block *zjson.Block, organization string) string {
	return organization + "-" + block.Action.Container.Image + "-" + block.Action.Container.Version
}

func getKanikoBuildContextS3Key(block *zjson.Block, organization string) string {
	return getKanikoTemplateName(block, organization) + "-build"
}
