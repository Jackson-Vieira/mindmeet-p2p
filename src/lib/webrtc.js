import Peer from "peerjs"

const DEBUG_LEVEL = 3;
 
class EventEmitter {
  constructor() {
    this.events = {};
  };

  dispatchEvent = (e, data) => {
    if (!this.events[e]) return;
    this.events[e].forEach(callback => callback(data));
  };

  addEventListener = (event, callback) => {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  };

  removeEventListener = (event) => {
    if (!this.events[event]) return;
    delete this.events[event];
  };
};


export default class P2P extends EventEmitter {
    constructor() {
        super();
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.mediaConnection = null;
        this.configuration = {
            iceServers: [
                {
                    urls: [
                        'stun:stun3.l.google.com:19302',
                        'stun:stun4.l.google.com:19302'
                    ]
                }
            ],
            iceCandidatePoolSize: 10
        };
    };

    createPeer = async (pid) => {
        this.peerConnection = new Peer(pid, options={
            config: this.configuration,
            debug: DEBUG_LEVEL
        });
        this.remoteStream = new MediaStream();

        this.openReceiveDataChannel();
        this.openReiceveMediaChannel();

        this.peerConnection.on('open', () => {
            console.log('peer opened');
            this.dispatchEvent('peer-opened', pid);
        });

        this.peerConnection.on('error', (err) => {
            console.log(err);
        });

        this.peerConnection.on('close', () => {
            this.dispatchEvent('peer-closed');
            this.peerConnection.destroy();
            this.peerConnection = null;
        });


        try { 
            this.localStream = await navigator.mediaDevices.getUserMedia(
                { 
                audio: true,
                video: true
                }
            );

            this.localStream.getTracks().forEach((track) => {
                this.peerConnection.addTrack(track, this.localStream);
            });
      
            this.dispatchEvent('local-stream-available');

            this.peerConnection.ontrack = (e) => {
                e.streams[0].getTracks().forEach((track) => {
                this.remoteStream.addTrack(track, this.remoteStream);
                });
                this.dispatchEvent('remote-stream-available');
            };
            return true;
        } catch(err) {
            console.log(err);
            return false;
        };
    }

    // TODO: Refactor to use only one method for call and answer
    call = (pid) => {
        this.mediaConnection = this.peerConnection.call(pid, this.localStream);
        this.dataChannel = this.peerConnection.connect(pid);

        this.mediaConnection.on('stream', (stream) => {
            this.remoteStream = stream;
            console.log('remote stream received');
            this.dispatchEvent('remote-stream-received');
        });

        this.mediaConnection.on('close', () => {
            this.dispatchEvent('media-connection-closed');
        });

        this.mediaConnection.on('error', (err) => {
            console.log(err);
        });

        this.dataChannel.on('open', () => {
            this.dispatchEvent('data-channel-opened');
        });

        this.dataChannel.on('data', (data) => {
            const msg = {data: data, time: new Date().toLocaleTimeString(), type: 'received'};
            this.messages.push(msg);
            console.log("data received: ", data);
            this.dispatchEvent('data-received', msg);
        });

        this.dataChannel.on('close', () => {
            this.dispatchEvent('data-channel-closed');
        })

        this.dataChannel.on('error', (err) => {
            console.log(err);
        });
    }
        

    openReceiveDataChannel = () => {
        this.peerConnection.on('connection', (conn) => {
            console.log('data channel opened');
            this.dataChannel = conn;
            this.dispatchEvent('connection-opened');

            this.dataChannel.on('open', () => {
                this.dispatchEvent('data-channel-opened');
            });

            this.dataChannel.on('data', (data) => {
                const msg = {data: data, time: new Date().toLocaleTimeString(), type: 'received'};
                this.messages.push(msg);
                console.log("data received: ", data);
                this.dispatchEvent('data-received', msg);
            });
        })
    }

    openReiceveMediaChannel = () => {
        this.peerConnection.on('call', (call) => {
            this.mediaConnection = call;
            console.log('answer call');
            this.mediaConnection.answer(this.localStream);
            this.mediaConnection.on('stream', (stream) => {
                this.remoteStream = stream;
                console.log('remote stream received');
                this.dispatchEvent('remote-stream-received');
            });
        });
    }

    init = async (_pid) => {
        const success = await this.createPeer(_pid);
        if(!success) {
            throw new Error('Failed to create peer');
        }
    }

    muteAudio = (mute) => {
        this.localStream.getAudioTracks().forEach((track) => {
            track.enabled = !mute;
        });
    }

    pauseVideo = (pause) => {
        this.localStream.getVideoTracks().forEach((track) => {
            track.enabled = !pause;
        });
    }

    send = (payload) => {
        if(this.dataChannel) {
            this.dataChannel.send(JSON.stringify(payload));
        }
    }
}