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

func (c *Client) Receive() {
	c.Conn.SetReadLimit(1024)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	for {
		var msg Message
		if err := c.Conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Printf("Read error: %v", err)
			}
			return
		}
		msg.Room = c.Room
		c.Hub.Broadcast <- msg
	}
}

func (c *Client) Send() {
	ticker := time.NewTicker(pingPeriod)

	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.ToSend:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			} else {
				msg.Room = ""
				if err := c.Conn.WriteJSON(msg); err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						log.Printf("Write error: %v", err)
					}
					return
				}
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
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

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.Clients[client.Room][client] = true
		case client := <-h.Unregister:
			if _, ok := h.Clients[client.Room]; ok {
				delete(h.Clients[client.Room], client)
				close(client.ToSend)
			}
		case message := <-h.Broadcast:
			for client := range h.Clients[message.Room] {
				select {
				case client.ToSend <- message:
				default:
					delete(h.Clients[client.Room], client)
					close(client.ToSend)
				}
			}
		}
	}
}

func (h *Hub) GetRooms() []string {
	roomLen := len(h.Clients)
	var rooms = make([]string, 0, roomLen)
	for room := range h.Clients {
		rooms = append(rooms, room)
	}

	return rooms
}

func (h *Hub) OpenRoom(room string) error {
	if _, ok := h.Clients[room]; ok {
		return errors.New("pipeline already exists")
	}

	h.Clients[room] = make(map[*Client]bool)

	return nil
}

func (h *Hub) CloseRoom(room string) {
	if _, ok := h.Clients[room]; ok {
		for client := range h.Clients[room] {
			close(client.ToSend)
		}
		delete(h.Clients, room)
	}
}

func serveSocket(conn *websocket.Conn, room string, h *Hub) HTTPError {
	if _, ok := h.Clients[room]; !ok { // if does not exist
		return BadRequest{"room " + room + " does not exist"}
	}

	client := &Client{
		Room:   room,
		Conn:   conn,
		ToSend: make(chan Message, 1024),
		Hub:    h,
	}

	h.Register <- client
	go client.Receive()
	go client.Send()
	return nil
}
