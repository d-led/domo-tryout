// Example actor pattern demonstrating phony usage
// This file shows the pattern from the reference code:
// - Hub actor managing subscribers and message queue
// - Subscriber actors for individual connections
// - Sync methods (phony.Block) for external code
// - Async methods (Act) for actor-to-actor communication
// - Subscribe/unsubscribe pattern
// - Broadcast pattern

package main

import (
	"log"
	"time"

	"github.com/Arceliar/phony"
)

// Message represents a simple message
type Message struct {
	Type int
	Body string
}

// HubActor manages subscribers and message queue
type HubActor struct {
	phony.Inbox
	messageQueue []Message
	subscribers  []*SubscriberActor
}

// SubscriberActor handles individual connections/clients
type SubscriberActor struct {
	phony.Inbox
	id        string
	hub       *HubActor
	onMessage func(Message) // Callback for when message is received
}

// NewHubActor creates a new hub actor
func NewHubActor() *HubActor {
	return &HubActor{
		messageQueue: []Message{},
		subscribers:  []*SubscriberActor{},
	}
}

// NewSubscriberActor creates a new subscriber actor
func NewSubscriberActor(id string, hub *HubActor, onMessage func(Message)) *SubscriberActor {
	s := &SubscriberActor{
		id:        id,
		hub:       hub,
		onMessage: onMessage,
	}
	// Subscribe to hub asynchronously
	hub.SubscribeAsync(s)
	return s
}

// Sync methods - use phony.Block from external (non-actor) code only

// GetMessagesSync blocks until messages are retrieved
func (h *HubActor) GetMessagesSync() []Message {
	var res []Message
	phony.Block(h, func() {
		res = h.messageQueue
	})
	return res
}

// PopMessagesSync blocks until messages are retrieved and queue is cleared
func (h *HubActor) PopMessagesSync() []Message {
	var res []Message
	phony.Block(h, func() {
		res = h.messageQueue
		h.messageQueue = []Message{}
	})
	return res
}

// AddMessageSync blocks until message is added - for external code
func (h *HubActor) AddMessageSync(msg Message) {
	phony.Block(h, func() {
		h.messageQueue = append(h.messageQueue, msg)
		log.Printf("Message added to queue, total: %d", len(h.messageQueue))
	})
}

// Async methods - use Act for actor-to-actor communication

// SubscribeAsync tells hub to add a subscriber (called by subscriber itself)
func (h *HubActor) SubscribeAsync(sub *SubscriberActor) {
	h.Act(sub, func() {
		h.subscribers = append(h.subscribers, sub)
		log.Printf("Subscriber %s subscribed, total: %d", sub.id, len(h.subscribers))
	})
}

// UnsubscribeAsync tells hub to remove a subscriber
func (h *HubActor) UnsubscribeAsync(sub *SubscriberActor) {
	h.Act(sub, func() {
		var newSubs []*SubscriberActor
		for _, s := range h.subscribers {
			if s != sub {
				newSubs = append(newSubs, s)
			}
		}
		h.subscribers = newSubs
		log.Printf("Subscriber %s unsubscribed, total: %d", sub.id, len(h.subscribers))
	})
}

// BroadcastAsync tells hub to broadcast message to all subscribers (actor-to-actor)
func (h *HubActor) BroadcastAsync(msg Message) {
	h.Act(h, func() {
		if len(h.subscribers) == 0 {
			log.Println("No subscribers to broadcast to")
			return
		}
		log.Printf("Broadcasting message to %d subscribers", len(h.subscribers))
		for _, sub := range h.subscribers {
			sub.OnMessage(msg)
		}
	})
}

// BroadcastSync blocks until message is broadcast - for external code
func (h *HubActor) BroadcastSync(msg Message) {
	phony.Block(h, func() {
		if len(h.subscribers) == 0 {
			log.Println("No subscribers to broadcast to")
			return
		}
		log.Printf("Broadcasting message to %d subscribers", len(h.subscribers))
		for _, sub := range h.subscribers {
			sub.OnMessage(msg)
		}
	})
}

// OnMessage tells subscriber to handle a message
func (s *SubscriberActor) OnMessage(msg Message) {
	s.Act(s.hub, func() {
		if s.onMessage != nil {
			s.onMessage(msg)
		}
		log.Printf("Subscriber %s received message: %s", s.id, msg.Body)
	})
}

// Unsubscribe tells hub to remove this subscriber
func (s *SubscriberActor) Unsubscribe() {
	s.hub.UnsubscribeAsync(s)
}

// Example usage - demonstrates the pattern
func ExampleActorPattern() {
	hub := NewHubActor()

	// Create subscribers (they auto-subscribe)
	sub1 := NewSubscriberActor("client1", hub, func(msg Message) {
		log.Printf("Client1 callback: %s", msg.Body)
	})

	sub2 := NewSubscriberActor("client2", hub, func(msg Message) {
		log.Printf("Client2 callback: %s", msg.Body)
	})

	// Give actors time to process subscriptions
	time.Sleep(10 * time.Millisecond)

	// Add messages from external code (using Block)
	hub.AddMessageSync(Message{Type: 1, Body: "Hello"})
	hub.AddMessageSync(Message{Type: 1, Body: "World"})

	// Broadcast from external code (using Block)
	hub.BroadcastSync(Message{Type: 1, Body: "Broadcast message"})

	// Give actors time to process messages
	time.Sleep(10 * time.Millisecond)

	// Cleanup
	sub1.Unsubscribe()
	sub2.Unsubscribe()

	// Give actors time to process unsubscriptions
	time.Sleep(10 * time.Millisecond)
}
