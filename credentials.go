package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/url"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	endpoints "github.com/aws/smithy-go/endpoints"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type Oracle struct {
	RegistryAddr string
	RegistryUser string
	RegistryPass string
	ClusterIP    string
	Token        string
	CaCert       string
}

type AWS struct {
	//RegistryAddr  string
	RegistryToken string
	ClusterIP     string
	ClusterName   string
	CaCert        string
	AccessKey     string
	SecretKey     string
}

type Token struct {
	Token      string
	Expiration time.Time
}

const (
	requestPresignParam    = 60
	presignedURLExpiration = 15 * time.Minute
	v1Prefix               = "k8s-aws-v1."
	clusterIDHeader        = "x-k8s-aws-id"
)

const BUCKET = "zetaforge"

type LocalEndpoint struct {
	Bucket string
	S3Port int
}

func (endpoint *LocalEndpoint) ResolveEndpoint(ctx context.Context, params s3.EndpointParameters) (endpoints.Endpoint, error) {
	uri, err := url.Parse(fmt.Sprintf("http://localhost:%d/%s", endpoint.S3Port, endpoint.Bucket))
	return endpoints.Endpoint{URI: *uri}, err
}

func s3Client(ctx context.Context, cfg Config) (*s3.Client, error) {
	awsAccessKey := "AKIAIOSFODNN7EXAMPLE"
	awsSecretKey := "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
	creds := credentials.NewStaticCredentialsProvider(awsAccessKey, awsSecretKey, "")
	region := config.WithRegion("us-east-2")
	awsConfig, err := config.LoadDefaultConfig(ctx, region, config.WithCredentialsProvider(creds))
	if err != nil {
		return &s3.Client{}, err
	}
	client := s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.EndpointResolverV2 = &LocalEndpoint{Bucket: BUCKET, S3Port: cfg.Local.BucketPort}
	})

	return client, nil
}

func awsToken(ctx context.Context, cfg Config) (Token, error) {
	creds := credentials.NewStaticCredentialsProvider(cfg.Cloud.AWS.AccessKey, cfg.Cloud.AWS.SecretKey, "")
	region := config.WithRegion("us-east-2")
	awsConfig, err := config.LoadDefaultConfig(ctx, region, config.WithCredentialsProvider(creds))
	if err != nil {
		return Token{}, err
	}

	client := sts.NewFromConfig(awsConfig, func(o *sts.Options) {
		o.APIOptions = []func(*middleware.Stack) error{
			smithyhttp.AddHeaderValue(clusterIDHeader, cfg.Cloud.AWS.ClusterName),
		}
	})

	presignClient := sts.NewPresignClient(client)

	presignedRequest, err := presignClient.PresignGetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})

	if err != nil {
		return Token{}, err
	}

	tokenExpiration := time.Now().Add(presignedURLExpiration - time.Minute)
	return Token{v1Prefix + base64.RawURLEncoding.EncodeToString([]byte(presignedRequest.URL)), tokenExpiration}, nil
}

func kubernetesClient(config Config) (clientcmd.ClientConfig, error) {
	var client clientcmd.ClientConfig
	if config.IsLocal {
		client = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			clientcmd.NewDefaultClientConfigLoadingRules(),
			&clientcmd.ConfigOverrides{},
		)
		return client, nil

	} else {
		switch config.Cloud.Provider {
		case "aws":
			token, err := awsToken(context.TODO(), config)
			if err != nil {
				log.Fatalf("Failed to identify aws credentials; err=%v", err)
			}
			cacert, err := base64.StdEncoding.DecodeString(config.Cloud.AWS.CaCert)
			if err != nil {
				log.Fatalf("Invalid CA certificate; err=%v", err)
			}

			cfg := api.NewConfig()
			cfg.Clusters["zetacluster"] = &api.Cluster{
				Server:                   "https://" + config.Cloud.AWS.ClusterIP,
				CertificateAuthorityData: cacert,
			}
			cfg.AuthInfos["zetaauth"] = &api.AuthInfo{
				Token: token.Token,
			}
			cfg.Contexts["zetacontext"] = &api.Context{
				Cluster:  "zetacluster",
				AuthInfo: "zetaauth",
			}
			cfg.CurrentContext = "zetacontext"

			client = clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{})
			return client, nil
		case "oracle":
			cacert, err := base64.StdEncoding.DecodeString(config.Cloud.Oracle.CaCert)
			if err != nil {
				log.Fatalf("Invalid CA certificate; err=%v", err)
			}

			cfg := api.NewConfig()
			cfg.Clusters["zetacluster"] = &api.Cluster{
				Server:                   "https://" + config.Cloud.Oracle.ClusterIP,
				CertificateAuthorityData: cacert,
			}
			cfg.AuthInfos["zetaauth"] = &api.AuthInfo{
				Token: config.Cloud.Oracle.Token,
			}
			cfg.Contexts["zetacontext"] = &api.Context{
				Cluster:  "zetacluster",
				AuthInfo: "zetaauth",
			}
			cfg.CurrentContext = "zetacontext"

			client = clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{})
			return client, nil
		default:
			return client, errors.New("Invalid Cloud Provider")
		}
	}
}

func registryAddress(config Config) (string, error) {
	switch config.Cloud.Provider {
	case "aws":
		return config.Cloud.Oracle.RegistryAddr, nil
	case "oracle":
		return config.Cloud.Oracle.RegistryAddr, nil
	default:
		return "", errors.New("Invalid Cloud Provider")
	}
}
