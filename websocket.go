package main

import (
	"errors"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const writeWait = 10 * time.Second
const pongWait = 60 * time.Second
const pingPeriod = (pongWait * 9) / 10

type Client struct {
	Room   string
	Conn   *websocket.Conn
	ToSend chan Message
	Hub    *Hub
}

func (client *Client) Receive() {
	client.Conn.SetReadLimit(1024)
	client.Conn.SetReadDeadline(time.Now().Add(pongWait))
	client.Conn.SetPongHandler(func(string) error {
		client.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	defer func() {
		client.Hub.Unregister <- client
		client.Conn.Close()
	}()

	for {
		var msg Message
		if err := client.Conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Printf("Read error: %v", err)
			}
			return
		}
		msg.Room = client.Room
		client.Hub.Broadcast <- msg
	}
}

func (client *Client) Send() {
	ticker := time.NewTicker(pingPeriod)

	defer func() {
		ticker.Stop()
		client.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-client.ToSend:
			client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			} else {
				msg.Room = ""
				if err := client.Conn.WriteJSON(msg); err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						log.Printf("Write error: %v", err)
					}
					return
				}
			}
		case <-ticker.C:
			client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					log.Printf("Ping error: %v", err)
				}
				return
			}
		}
	}
}

type Message struct {
	Room    string `json:"room,omitempty"`
	Content string `json:"content"`
}

type Hub struct {
	Clients    map[string]map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan Message
}

func newHub() *Hub {
	return &Hub{
		Clients:    make(map[string]map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan Message),
	}
}

func (hub *Hub) Run() {
	for {
		select {
		case client := <-hub.Register:
			hub.Clients[client.Room][client] = true
		case client := <-hub.Unregister:
			if _, ok := hub.Clients[client.Room]; ok {
				delete(hub.Clients[client.Room], client)
				close(client.ToSend)
			}
		case message := <-hub.Broadcast:
			for client := range hub.Clients[message.Room] {
				select {
				case client.ToSend <- message:
				default:
					delete(hub.Clients[client.Room], client)
					close(client.ToSend)
				}
			}
		}
	}
}

func (hub *Hub) GetRooms() []string {
	roomLen := len(hub.Clients)
	var rooms = make([]string, 0, roomLen)
	for room := range hub.Clients {
		rooms = append(rooms, room)
	}

	return rooms
}

func (hub *Hub) OpenRoom(room string) error {
	if _, ok := hub.Clients[room]; ok {
		return errors.New("Pipeline already exists")
	}

	hub.Clients[room] = make(map[*Client]bool)

	return nil
}

func (hub *Hub) CloseRoom(room string) {
	if _, ok := hub.Clients[room]; ok {
		for client := range hub.Clients[room] {
			close(client.ToSend)
		}
		delete(hub.Clients, room)
	}
}

func serveSocket(conn *websocket.Conn, room string, hub *Hub) HTTPError {
	if _, ok := hub.Clients[room]; !ok { // if does not exist
		return BadRequest{"room " + room + " does not exist"}
	}

	client := &Client{
		Room:   room,
		Conn:   conn,
		ToSend: make(chan Message, 1024),
		Hub:    hub,
	}

	hub.Register <- client
	go client.Receive()
	go client.Send()
	return nil
}
