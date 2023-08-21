package echo

import (
	"archive/tar"
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"golang.org/x/xerrors"
	protobuf "google.golang.org/protobuf/proto"

	"github.com/google/uuid"
	"github.com/spf13/afero"

	"github.com/coder/coder/v2/provisionersdk"
	"github.com/coder/coder/v2/provisionersdk/proto"
)

// ProvisionApplyWithAgent returns provision responses that will mock a fake
// "aws_instance" resource with an agent that has the given auth token.
func ProvisionApplyWithAgent(authToken string) []*proto.Provision_Response {
	return []*proto.Provision_Response{{
		Type: &proto.Provision_Response_Complete{
			Complete: &proto.Provision_Complete{
				Resources: []*proto.Resource{{
					Name: "example",
					Type: "aws_instance",
					Agents: []*proto.Agent{{
						Id:   uuid.NewString(),
						Name: "example",
						Auth: &proto.Agent_Token{
							Token: authToken,
						},
					}},
				}},
			},
		},
	}}
}

var (
	// ParseComplete is a helper to indicate an empty parse completion.
	ParseComplete = []*proto.Parse_Response{{
		Type: &proto.Parse_Response_Complete{
			Complete: &proto.Parse_Complete{},
		},
	}}
	// ProvisionComplete is a helper to indicate an empty provision completion.
	ProvisionComplete = []*proto.Provision_Response{{
		Type: &proto.Provision_Response_Complete{
			Complete: &proto.Provision_Complete{},
		},
	}}

	// ProvisionFailed is a helper to convey a failed provision
	// operation.
	ProvisionFailed = []*proto.Provision_Response{{
		Type: &proto.Provision_Response_Complete{
			Complete: &proto.Provision_Complete{
				Error: "failed!",
			},
		},
	}}
)

// Serve starts the echo provisioner.
func Serve(ctx context.Context, filesystem afero.Fs, options *provisionersdk.ServeOptions) error {
	return provisionersdk.Serve(ctx, &echo{
		filesystem: filesystem,
	}, options)
}

// The echo provisioner serves as a dummy provisioner primarily
// used for testing. It echos responses from JSON files in the
// format %d.protobuf. It's used for testing.
type echo struct {
	filesystem afero.Fs
}

// Parse reads requests from the provided directory to stream responses.
func (e *echo) Parse(request *proto.Parse_Request, stream proto.DRPCProvisioner_ParseStream) error {
	for index := 0; ; index++ {
		path := filepath.Join(request.Directory, fmt.Sprintf("%d.parse.protobuf", index))
		_, err := e.filesystem.Stat(path)
		if err != nil {
			if index == 0 {
				// Error if nothing is around to enable failed states.
				return xerrors.Errorf("no state: %w", err)
			}
			break
		}
		data, err := afero.ReadFile(e.filesystem, path)
		if err != nil {
			return xerrors.Errorf("read file %q: %w", path, err)
		}
		var response proto.Parse_Response
		err = protobuf.Unmarshal(data, &response)
		if err != nil {
			return xerrors.Errorf("unmarshal: %w", err)
		}
		err = stream.Send(&response)
		if err != nil {
			return err
		}
	}
	<-stream.Context().Done()
	return stream.Context().Err()
}

// Provision reads requests from the provided directory to stream responses.
func (e *echo) Provision(stream proto.DRPCProvisioner_ProvisionStream) error {
	msg, err := stream.Recv()
	if err != nil {
		return err
	}

	var config *proto.Provision_Config
	switch {
	case msg.GetPlan() != nil:
		config = msg.GetPlan().GetConfig()
	case msg.GetApply() != nil:
		config = msg.GetApply().GetConfig()
	default:
		// Probably a cancel
		return nil
	}

outer:
	for i := 0; ; i++ {
		var extension string
		if msg.GetPlan() != nil {
			extension = ".plan.protobuf"
		} else {
			extension = ".apply.protobuf"
		}
		var (
			path      string
			pathIndex int
		)
		// Try more specific path first, then fallback to generic.
		paths := []string{
			filepath.Join(config.Directory, fmt.Sprintf("%d.%s.provision"+extension, i, strings.ToLower(config.GetMetadata().GetWorkspaceTransition().String()))),
			filepath.Join(config.Directory, fmt.Sprintf("%d.provision"+extension, i)),
		}
		for pathIndex, path = range paths {
			_, err := e.filesystem.Stat(path)
			if err != nil && pathIndex == len(paths)-1 {
				// If there are zero messages, something is wrong.
				if i == 0 {
					// Error if nothing is around to enable failed states.
					return xerrors.New("no state")
				}
				// Otherwise, we're done with the entire provision.
				break outer
			} else if err != nil {
				continue
			}
			break
		}
		data, err := afero.ReadFile(e.filesystem, path)
		if err != nil {
			return xerrors.Errorf("read file %q: %w", path, err)
		}
		var response proto.Provision_Response
		err = protobuf.Unmarshal(data, &response)
		if err != nil {
			return xerrors.Errorf("unmarshal: %w", err)
		}
		r, ok := filterLogResponses(config, &response)
		if !ok {
			continue
		}

		err = stream.Send(r)
		if err != nil {
			return err
		}
	}
	<-stream.Context().Done()
	return stream.Context().Err()
}

func (*echo) Shutdown(_ context.Context, _ *proto.Empty) (*proto.Empty, error) {
	return &proto.Empty{}, nil
}

// Responses is a collection of mocked responses to Provision operations.
type Responses struct {
	Parse          []*proto.Parse_Response
	ProvisionApply []*proto.Provision_Response
	ProvisionPlan  []*proto.Provision_Response

	// ProvisionApplyMap and ProvisionPlanMap are used to mock specific
	// transition responses.
	ProvisionApplyMap map[proto.WorkspaceTransition][]*proto.Provision_Response
	ProvisionPlanMap  map[proto.WorkspaceTransition][]*proto.Provision_Response
}

// Tar returns a tar archive of responses to provisioner operations.
func Tar(responses *Responses) ([]byte, error) {
	if responses == nil {
		responses = &Responses{
			ParseComplete, ProvisionComplete, ProvisionComplete,
			nil, nil,
		}
	}
	if responses.ProvisionPlan == nil {
		responses.ProvisionPlan = responses.ProvisionApply
	}

	var buffer bytes.Buffer
	writer := tar.NewWriter(&buffer)

	writeProto := func(name string, message protobuf.Message) error {
		data, err := protobuf.Marshal(message)
		if err != nil {
			return err
		}

		err = writer.WriteHeader(&tar.Header{
			Name: name,
			Size: int64(len(data)),
			Mode: 0o644,
		})
		if err != nil {
			return err
		}

		_, err = writer.Write(data)
		if err != nil {
			return err
		}

		return nil
	}
	for index, response := range responses.Parse {
		err := writeProto(fmt.Sprintf("%d.parse.protobuf", index), response)
		if err != nil {
			return nil, err
		}
	}
	for index, response := range responses.ProvisionApply {
		err := writeProto(fmt.Sprintf("%d.provision.apply.protobuf", index), response)
		if err != nil {
			return nil, err
		}
	}
	for index, response := range responses.ProvisionPlan {
		err := writeProto(fmt.Sprintf("%d.provision.plan.protobuf", index), response)
		if err != nil {
			return nil, err
		}
	}
	for trans, m := range responses.ProvisionApplyMap {
		for i, rs := range m {
			err := writeProto(fmt.Sprintf("%d.%s.provision.apply.protobuf", i, strings.ToLower(trans.String())), rs)
			if err != nil {
				return nil, err
			}
		}
	}
	for trans, m := range responses.ProvisionPlanMap {
		for i, rs := range m {
			err := writeProto(fmt.Sprintf("%d.%s.provision.plan.protobuf", i, strings.ToLower(trans.String())), rs)
			if err != nil {
				return nil, err
			}
		}
	}
	err := writer.Flush()
	if err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func filterLogResponses(config *proto.Provision_Config, response *proto.Provision_Response) (*proto.Provision_Response, bool) {
	responseLog, ok := response.Type.(*proto.Provision_Response_Log)
	if !ok {
		// Pass all non-log responses
		return response, true
	}

	if config.ProvisionerLogLevel == "" {
		// Don't change the default behavior of "echo"
		return response, true
	}

	provisionerLogLevel := proto.LogLevel_value[strings.ToUpper(config.ProvisionerLogLevel)]
	if int32(responseLog.Log.Level) < provisionerLogLevel {
		// Log level is not enabled
		return nil, false
	}
	return response, true
}
