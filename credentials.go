package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/url"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	endpoints "github.com/aws/smithy-go/endpoints"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/google/go-containerregistry/pkg/authn"
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
	RegistryAddr  string
	RegistryToken string
	ClusterIP     string
	ClusterName   string
	ClusterRegion string
	CaCert        string
	AccessKey     string
	SecretKey     string
}

type Debug struct {
	RegistryAddr string
	RegistryPort int
	RegistryUser string
	RegistryPass string
	ClusterIP    string
	Token        string
	CaCert       string
}

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

func awsToken(ctx context.Context, cfg Config) (string, error) {
	creds := credentials.NewStaticCredentialsProvider(cfg.Cloud.AWS.AccessKey, cfg.Cloud.AWS.SecretKey, "")
	region := config.WithRegion(cfg.Cloud.AWS.ClusterRegion)
	awsConfig, err := config.LoadDefaultConfig(ctx, region, config.WithCredentialsProvider(creds))
	if err != nil {
		return "", err
	}

	client := sts.NewFromConfig(awsConfig, func(o *sts.Options) {
		o.APIOptions = []func(*middleware.Stack) error{
			smithyhttp.AddHeaderValue("x-k8s-aws-id", cfg.Cloud.AWS.ClusterName),
			smithyhttp.AddHeaderValue("X-Amz-Expires", "60"),
		}
	})

	presignedRequest, err := sts.NewPresignClient(client).PresignGetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})

	if err != nil {
		return "", err
	}

	return "k8s-aws-v1." + base64.RawURLEncoding.EncodeToString([]byte(presignedRequest.URL)), nil
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
				return client, err
			}
			cacert, err := base64.StdEncoding.DecodeString(config.Cloud.AWS.CaCert)
			if err != nil {
				return client, err
			}

			cfg := api.NewConfig()
			cfg.Clusters["zetacluster"] = &api.Cluster{
				Server:                   "https://" + config.Cloud.AWS.ClusterIP,
				CertificateAuthorityData: cacert,
			}
			cfg.AuthInfos["zetaauth"] = &api.AuthInfo{
				Token: token,
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
				return client, err
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
			client = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
				clientcmd.NewDefaultClientConfigLoadingRules(),
				&clientcmd.ConfigOverrides{},
			)
			return client, nil
		}
	}
}

func registryAddress(config Config) string {
	switch config.Cloud.Provider {
	case "aws":
		return config.Cloud.AWS.RegistryAddr
	case "oracle":
		return config.Cloud.Oracle.RegistryAddr
	default:
		return config.Cloud.Debug.RegistryAddr
	}
}

func registryAuth(config Config) authn.Authenticator {
	switch config.Cloud.Provider {
	case "aws":
		auth := authn.FromConfig(
			authn.AuthConfig{
				RegistryToken: config.Cloud.AWS.RegistryToken,
			},
		)
		return auth
	case "oracle":
		auth := authn.FromConfig(
			authn.AuthConfig{
				Username: config.Cloud.Oracle.RegistryUser,
				Password: config.Cloud.Oracle.RegistryPass,
			},
		)
		return auth
	default:
		return authn.Anonymous
	}
}
