package main

import (
	"bytes"
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"time"

	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

const WAIT_TIME = 5 * time.Second

//go:embed setup/*
var kubectlFiles embed.FS

func portForward(ctx context.Context, service string, namespace string, port int, targetPort int, stopCh <-chan struct{}, readyCh chan struct{}, clientConfig *rest.Config) error {
	clientset, err := kubernetes.NewForConfig(clientConfig)
	if err != nil {
		return err
	}

	svc, err := clientset.CoreV1().Services(namespace).Get(ctx, service, metav1.GetOptions{})
	if err != nil {
		return err
	}

	labels := []string{}
	for key, val := range svc.Spec.Selector {
		labels = append(labels, key+"="+val)
	}
	label := strings.Join(labels, ",")

	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: label, Limit: 1})
	if err != nil {
		return err
	}

	if len(pods.Items) == 0 {
		return errors.New("no pods associated with service " + service)
	}
	pod := pods.Items[0]

	podPort := targetPort
	for _, val := range svc.Spec.Ports {
		if int(val.Port) == targetPort {
			podPort = val.TargetPort.IntValue()
			break
		}
	}

	transport, upgrader, err := spdy.RoundTripperFor(clientConfig)
	if err != nil {
		return err
	}

	hostIP := strings.TrimLeft(clientConfig.Host, "https://")
	path := "/api/v1/namespaces/" + namespace + "/pods/" + pod.Name + "/portforward"

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, &url.URL{Scheme: "https", Path: path, Host: hostIP})
	fw, err := portforward.New(dialer, []string{fmt.Sprintf("%d:%d", port, podPort)}, stopCh, readyCh, os.Stdout, os.Stderr)
	if err != nil {
		return err
	}
	return fw.ForwardPorts()
}

func kubectlResources(clientConfig *rest.Config) (map[string]string, error) {
	mapping := make(map[string]string)
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(clientConfig)
	if err != nil {
		return mapping, err
	}

	res, err := discoveryClient.ServerPreferredResources()
	if err != nil {
		return mapping, err
	}

	for _, resources := range res {
		for _, resource := range resources.APIResources {
			mapping[resource.Kind] = resource.Name
		}
	}

	return mapping, nil
}

func validNamespace(namespace string, Kind string) bool {
	if namespace == "" {
		if Kind != "Namespace" && Kind != "CustomResourceDefinition" && Kind != "ClusterRole" && Kind != "ClusterRoleBinding" && Kind != "PriorityClass" {
			return false
		}
	}
	return true
}

func kubectlApply(ctx context.Context, filePath string, resources map[string]string, clientConfig *rest.Config) error {
	file, err := kubectlFiles.ReadFile(filePath)
	if err != nil {
		return err
	}
	reader := io.NopCloser(bytes.NewReader(file))

	dynamicClient, err := dynamic.NewForConfig(clientConfig)
	if err != nil {
		return err
	}

	item := yaml.NewDocumentDecoder(reader)

	var obj unstructured.Unstructured
	decoder := scheme.Codecs.UniversalDeserializer()
	buffer := make([]byte, 1024*1024*5)
	for {
		n, err := item.Read(buffer)
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		_, gvk, err := decoder.Decode(buffer[:n], nil, &obj)
		if err != nil {
			return err
		}

		gvr := schema.GroupVersionResource{Group: gvk.Group, Version: gvk.Version, Resource: resources[gvk.Kind]}
		namespace := obj.GetNamespace()
		name := obj.GetName()
		if !validNamespace(namespace, gvk.Kind) {
			namespace = "default"
		}
		_, err = dynamicClient.Resource(gvr).Namespace(namespace).Apply(ctx, name, &obj, metav1.ApplyOptions{FieldManager: name})
		if err != nil {
			return err
		}
		log.Printf("Resource %s %s applied", gvk.Kind, name)
	}
}

func kubectlDelete(ctx context.Context, filePath string, resources map[string]string, clientConfig *rest.Config) error {
	file, err := kubectlFiles.ReadFile(filePath)
	if err != nil {
		return err
	}
	reader := io.NopCloser(bytes.NewReader(file))

	dynamicClient, err := dynamic.NewForConfig(clientConfig)
	if err != nil {
		return err
	}

	item := yaml.NewDocumentDecoder(reader)

	var obj unstructured.Unstructured
	decoder := scheme.Codecs.UniversalDeserializer()
	buffer := make([]byte, 1024*1024*5)
	for {
		n, err := item.Read(buffer)
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		_, gvk, err := decoder.Decode(buffer[:n], nil, &obj)
		if err != nil {
			return err
		}

		gvr := schema.GroupVersionResource{Group: gvk.Group, Version: gvk.Version, Resource: resources[gvk.Kind]}
		namespace := obj.GetNamespace()
		name := obj.GetName()
		if !validNamespace(namespace, gvk.Kind) {
			namespace = "default"
		}
		err = dynamicClient.Resource(gvr).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
		if err != nil {
			log.Printf("Resource %s %s deletion failed", gvk.Kind, name)
			continue
		}
		log.Printf("Resource %s %s deleted", gvk.Kind, name)
	}
}

func kubectlSeaweedFS(ctx context.Context, clientConfig *rest.Config, cfg Config) error {
	clientset, err := kubernetes.NewForConfig(clientConfig)
	if err != nil {
		return err
	}

	for {
		pods, err := clientset.CoreV1().Pods("default").List(ctx, metav1.ListOptions{LabelSelector: "app.kubernetes.io/name=weed"})
		if err != nil {
			return err
		}

		if len(pods.Items) > 0 {
			phase := pods.Items[0].Status.Phase
			if phase == v1.PodRunning {
				break
			} else if phase == v1.PodFailed || phase == v1.PodSucceeded {
				return errors.New("bucket has stopped working")
			}
		}

		log.Println("Waiting on bucket...")
		time.Sleep(WAIT_TIME)
	}

	for {
		_, err := http.Get(fmt.Sprintf("http://localhost:%d", cfg.Local.BucketPort))
		if err == nil {
			break
		}
		log.Println("Waiting on seaweedfs...")
		time.Sleep(WAIT_TIME)
	}

	return nil
}

func migrate(ctx context.Context, resources map[string]string, config Config, clientConfig *rest.Config, db *sql.DB) error {
	setupVersion, err := getSetupVersion(ctx, db)
	var version string
	if err != nil {
		version = config.SetupVersion
		// cleanup the earliest version
		if err := kubectlDelete(ctx, "setup/build-0.yaml", resources, clientConfig); err != nil {
			return err
		}

		if _, err := setSetupVersion(ctx, db, config.SetupVersion); err != nil {
			return err
		}
	} else {
		version = setupVersion.Version
	}

	if version < config.SetupVersion {
		if err := kubectlDelete(ctx, "setup/build-"+version+".yaml", resources, clientConfig); err != nil {
			return err
		}
		if _, err := setSetupVersion(ctx, db, config.SetupVersion); err != nil {
			return err
		}
		if err := kubectlApply(ctx, "setup/build-"+config.SetupVersion+".yaml", resources, clientConfig); err != nil {
			return err
		}
	} else if version > config.SetupVersion {
		log.Fatalf("Invalid version downgrade")
	} else {
		if err := kubectlApply(ctx, "setup/build-"+config.SetupVersion+".yaml", resources, clientConfig); err != nil {
			return err
		}
	}

	return nil
}

func setup(ctx context.Context, config Config, client clientcmd.ClientConfig, db *sql.DB) {
	clientConfig, err := client.ClientConfig()
	if err != nil {
		log.Fatalf("failed to get client config; err=%v", err)
	}

	log.Println("Starting Setup...")
	resources, err := kubectlResources(clientConfig)
	if err != nil {
		log.Fatalf("failed to fetch kubernetes resources; err=%v", err)
	}
	if err := kubectlApply(ctx, "setup/install.yaml", resources, clientConfig); err != nil {
		log.Fatalf("failed to install argo; err=%v", err)
	}
	if err := migrate(ctx, resources, config, clientConfig, db); err != nil {
		log.Fatalf("failed to migrate bucket; err=%v", err)
	}

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt)

	if config.Local.Driver == "minikube" {
		stopBucketCh := make(chan struct{}, 1)
		go func() {
			for {
				readyBucketCh := make(chan struct{})
				if err := portForward(ctx, "weed", "default", config.Local.BucketPort, 8333, stopBucketCh, readyBucketCh, clientConfig); err != nil {
					log.Printf("Port-Forwarding warning; warning=%v", err)
				}
				time.Sleep(WAIT_TIME)
			}
		}()

		go func() {
			<-signals
			log.Println("Starting Shutdown...")
			if err := kubectlDelete(ctx, "setup/install.yaml", resources, clientConfig); err != nil {
				log.Printf("failed to delete argo; err=%v", err)
			}
			if stopBucketCh != nil {
				close(stopBucketCh)
			}
			log.Println("Shutdown Successful")
			signal.Stop(signals)
			os.Exit(1)
		}()
	} else {
		go func() {
			<-signals
			log.Println("Starting Shutdown...")
			if err := kubectlDelete(ctx, "setup/install.yaml", resources, clientConfig); err != nil {
				log.Printf("failed to delete argo; err=%v", err)
			}
			log.Println("Shutdown Successful")
			signal.Stop(signals)
			os.Exit(1)
		}()
	}

	if err := kubectlSeaweedFS(ctx, clientConfig, config); err != nil {
		log.Fatalf("Setup execution failed; err=%v", err)
	}
	log.Println("Setup Successful")
}

func uninstall(ctx context.Context, client clientcmd.ClientConfig, db *sql.DB) {
	clientConfig, err := client.ClientConfig()
	if err != nil {
		log.Fatalf("failed to get client config; err=%v", err)
	}

	resources, err := kubectlResources(clientConfig)
	if err != nil {
		log.Fatalf("failed to fetch kubernetes resources; err=%v", err)
	}

	setupVersion, err := getSetupVersion(ctx, db)
	var version string
	if err != nil {
		version = "0"
	} else {
		version = setupVersion.Version
	}

	if err := kubectlDelete(ctx, "setup/build-"+version+".yaml", resources, clientConfig); err != nil {
		log.Fatalf("failed to delete bucket; err=%v", err)
	}
}
