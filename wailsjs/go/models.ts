export namespace main {
	
	export class Attachment {
	    id: string;
	    message_id: string;
	    file_id: string;
	    type: string;
	    filename: string;
	    path: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new Attachment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.message_id = source["message_id"];
	        this.file_id = source["file_id"];
	        this.type = source["type"];
	        this.filename = source["filename"];
	        this.path = source["path"];
	        this.size = source["size"];
	    }
	}
	export class Call {
	    id: string;
	    timestamp: string;
	    duration: string;
	    direction: string;
	    party_name: string;
	    party_identifier: string;
	    source: string;
	    is_evidence: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Call(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timestamp = source["timestamp"];
	        this.duration = source["duration"];
	        this.direction = source["direction"];
	        this.party_name = source["party_name"];
	        this.party_identifier = source["party_identifier"];
	        this.source = source["source"];
	        this.is_evidence = source["is_evidence"];
	    }
	}
	export class Chat {
	    id: string;
	    name: string;
	    source: string;
	    participants: string[];
	    message_count: number;
	    last_message: string;
	    last_message_time: string;
	
	    static createFrom(source: any = {}) {
	        return new Chat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.source = source["source"];
	        this.participants = source["participants"];
	        this.message_count = source["message_count"];
	        this.last_message = source["last_message"];
	        this.last_message_time = source["last_message_time"];
	    }
	}
	export class Contact {
	    id: string;
	    name: string;
	    identifier: string;
	    type: string;
	    photo_path: string;
	
	    static createFrom(source: any = {}) {
	        return new Contact(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.identifier = source["identifier"];
	        this.type = source["type"];
	        this.photo_path = source["photo_path"];
	    }
	}
	export class Evidence {
	    id: number;
	    artifact_type: string;
	    artifact_id: string;
	    notes: string;
	    tagged_at: string;
	    snippet: string;
	    metadata: string;
	
	    static createFrom(source: any = {}) {
	        return new Evidence(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.artifact_type = source["artifact_type"];
	        this.artifact_id = source["artifact_id"];
	        this.notes = source["notes"];
	        this.tagged_at = source["tagged_at"];
	        this.snippet = source["snippet"];
	        this.metadata = source["metadata"];
	    }
	}
	export class File {
	    id: string;
	    path: string;
	    filename: string;
	    size: number;
	    type: string;
	    md5: string;
	    created_time: string;
	    width?: number;
	    height?: number;
	    gps_latitude?: number;
	    gps_longitude?: number;
	    is_evidence: boolean;
	
	    static createFrom(source: any = {}) {
	        return new File(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.filename = source["filename"];
	        this.size = source["size"];
	        this.type = source["type"];
	        this.md5 = source["md5"];
	        this.created_time = source["created_time"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.gps_latitude = source["gps_latitude"];
	        this.gps_longitude = source["gps_longitude"];
	        this.is_evidence = source["is_evidence"];
	    }
	}
	export class Location {
	    id: string;
	    timestamp: string;
	    latitude: number;
	    longitude: number;
	    address: string;
	    source: string;
	    accuracy?: number;
	    is_evidence: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Location(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timestamp = source["timestamp"];
	        this.latitude = source["latitude"];
	        this.longitude = source["longitude"];
	        this.address = source["address"];
	        this.source = source["source"];
	        this.accuracy = source["accuracy"];
	        this.is_evidence = source["is_evidence"];
	    }
	}
	export class Message {
	    id: string;
	    chat_id: string;
	    timestamp: string;
	    body: string;
	    direction: string;
	    sender_id: string;
	    sender_name: string;
	    recipients: string;
	    status: string;
	    source: string;
	    attachments: Attachment[];
	    is_evidence: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.chat_id = source["chat_id"];
	        this.timestamp = source["timestamp"];
	        this.body = source["body"];
	        this.direction = source["direction"];
	        this.sender_id = source["sender_id"];
	        this.sender_name = source["sender_name"];
	        this.recipients = source["recipients"];
	        this.status = source["status"];
	        this.source = source["source"];
	        this.attachments = this.convertValues(source["attachments"], Attachment);
	        this.is_evidence = source["is_evidence"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ParseCounts {
	    contacts: number;
	    chats: number;
	    messages: number;
	    calls: number;
	    files: number;
	    locations: number;
	    web_history: number;
	
	    static createFrom(source: any = {}) {
	        return new ParseCounts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.contacts = source["contacts"];
	        this.chats = source["chats"];
	        this.messages = source["messages"];
	        this.calls = source["calls"];
	        this.files = source["files"];
	        this.locations = source["locations"];
	        this.web_history = source["web_history"];
	    }
	}
	export class ParseStatus {
	    active: boolean;
	    progress: number;
	    bytesRead: number;
	    totalBytes: number;
	    currentItem: string;
	    error?: string;
	    counts: ParseCounts;
	
	    static createFrom(source: any = {}) {
	        return new ParseStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.progress = source["progress"];
	        this.bytesRead = source["bytesRead"];
	        this.totalBytes = source["totalBytes"];
	        this.currentItem = source["currentItem"];
	        this.error = source["error"];
	        this.counts = this.convertValues(source["counts"], ParseCounts);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Stats {
	    contacts: number;
	    chats: number;
	    messages: number;
	    calls: number;
	    files: number;
	    images: number;
	    videos: number;
	    locations: number;
	    evidence: number;
	
	    static createFrom(source: any = {}) {
	        return new Stats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.contacts = source["contacts"];
	        this.chats = source["chats"];
	        this.messages = source["messages"];
	        this.calls = source["calls"];
	        this.files = source["files"];
	        this.images = source["images"];
	        this.videos = source["videos"];
	        this.locations = source["locations"];
	        this.evidence = source["evidence"];
	    }
	}
	export class TimelineEvent {
	    event_type: string;
	    id: string;
	    timestamp: string;
	    text: string;
	    direction: string;
	    detail_1: string;
	    detail_2: string;
	    is_evidence: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TimelineEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.event_type = source["event_type"];
	        this.id = source["id"];
	        this.timestamp = source["timestamp"];
	        this.text = source["text"];
	        this.direction = source["direction"];
	        this.detail_1 = source["detail_1"];
	        this.detail_2 = source["detail_2"];
	        this.is_evidence = source["is_evidence"];
	    }
	}

}

