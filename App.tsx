import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, FileMetadata, TransferProgress, HistoryItem, ConnectionStatus, ChatMessage, FileItem } from './types';
import { SendIcon, ReceiveIcon, CheckIcon, XIcon, LoadingIcon, SunIcon, MoonIcon } from './components/Icons';
import { FilePreview } from './components/FilePreview';
import { StatusBadge } from './components/StatusBadge';
import { TransferHistory } from './components/TransferHistory';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { SpeedGraph } from './components/SpeedGraph';
import { TelemetryPanel } from './components/TelemetryPanel';
import { TypingText } from './components/TypingText';

// import { playSound } from './utils/audio'; // Sounds disabled per user request
import { scanFiles } from './utils/fileScanning';
import { isMobile, requestWakeLock, releaseWakeLock } from './utils/device';
import JSZip from 'jszip';
import './services/firebase';


// Constants
const MIN_CHUNK_SIZE = 65536; // 64KB
const MAX_CHUNK_SIZE = 134217728; // 128MB (Ludicrous Speed)
const INITIAL_CHUNK_SIZE = 1048576; // 1MB

declare var Peer: any;

// Helpers
const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatSpeed = (bytesPerSecond: number) => {
  return formatSize(bytesPerSecond) + '/s';
};

const App: React.FC = () => {
  // Type needs to match string union
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [peerId, setPeerId] = useState<string>('');
  const [fourDigitCode, setFourDigitCode] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const selectedFilesRef = useRef<FileItem[]>([]);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const [receivedFiles, setReceivedFiles] = useState<{ blob: Blob; name: string; size: number; path: string }[]>([]);
  const receivedFilesRef = useRef<{ blob: Blob; name: string; size: number; path: string }[]>([]);

  useEffect(() => {
    receivedFilesRef.current = receivedFiles;
  }, [receivedFiles]);

  const [receiveCode, setReceiveCode] = useState<string>('');
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Telemetry State
  const [rtt, setRtt] = useState<number>(0);
  const [dynamicChunkSize, setDynamicChunkSize] = useState<number>(INITIAL_CHUNK_SIZE);
  const lastPingRef = useRef<number>(0);

  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [isZipping, setIsZipping] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [showChat, setShowChat] = useState(false);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null); // Primary control connection
  const connPoolRef = useRef<any[]>([]); // Data channels (Plaid Speed)
  const transferAbortedRef = useRef(false);

  // AppState Ref to fix closure staleness in listeners
  const appStateRef = useRef<AppState>(AppState.IDLE);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);



  // Resume state
  const partialChunksRef = useRef<ArrayBuffer[]>([]);
  const currentMetadataRef = useRef<FileMetadata | null>(null);
  const remoteCompleteRef = useRef(false);

  // Speed calc
  const lastBytesRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const currentSpeedRef = useRef(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);



  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
      document.body.className = savedTheme;
    } else {
      setTheme('light');
      document.body.className = 'light';
    }

    // Check for code parameter in URL (from QR scan)
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    if (codeParam && codeParam.length === 4 && /^\d{4}$/.test(codeParam)) {
      // Auto-connect directly without clicking "Ready"
      setReceiveCode(codeParam);
      setAppState(AppState.RECEIVING_INPUT);

      // Connect after a short delay to ensure state is set
      setTimeout(() => {
        const customId = codeParam;
        setError(null);
        setConnStatus('connecting');
        initPeer(customId);
      }, 100);
    }
  }, []);

  const toggleTheme = () => {

    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.body.className = newTheme;
  };

  useEffect(() => {
    const saved = localStorage.getItem('transfer_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('transfer_history', JSON.stringify(history));
  }, [history]);

  const generate4DigitId = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const initPeer = (customId?: string) => {
    // Don't reset if we are just interrupted and trying to reconnect
    if (appStateRef.current !== AppState.INTERRUPTED && appStateRef.current !== AppState.TRANSFERRING) {
      setConnStatus('connecting');
    }

    const id = customId || generate4DigitId();
    const script = document.createElement('script');
    script.src = '/peerjs.min.js';
    script.async = true;
    script.onload = () => {
      const newPeer = new Peer(id);

      newPeer.on('open', (id: string) => {
        setPeerId(id);
        setFourDigitCode(id);
        if (appStateRef.current === AppState.SENDING_WAITING) {
          setConnStatus('waiting');
        } else if (appStateRef.current === AppState.INTERRUPTED) {
          setConnStatus('waiting'); // Waiting for receiver to reconnect
        } else {
          setConnStatus('sender-connected');
        }
      });

      newPeer.on('error', (err: any) => {
        if (appStateRef.current === AppState.TRANSFERRING) {
          setAppState(AppState.INTERRUPTED);
          setConnStatus('reconnecting');

          return;
        }

        setConnStatus('error');
        if (err.type === 'unavailable-id') {
          newPeer.destroy();
          initPeer();
          return;
        }
        let userMessage = "Connection error.";
        switch (err.type) {
          case 'peer-unavailable': userMessage = "Code incorrect/offline."; break;
          case 'network': userMessage = "Network error. Check connection."; break;
          case 'invalid-id': userMessage = "Invalid code."; break;
          case 'browser-incompatible': userMessage = "Browser incompatible."; break;
          case 'socket-error': userMessage = "Server connection lost."; break;
        }
        setError(userMessage);
      });

      // Handle incoming connections (Sender logic)
      newPeer.on('connection', (conn: any) => {
        handleIncomingConnection(conn);
      });



      peerRef.current = newPeer;
    };
    document.body.appendChild(script);

    // Ping Loop
    const pingInterval = setInterval(() => {
      if (appStateRef.current === AppState.TRANSFERRING && connRef.current?.open) {
        lastPingRef.current = Date.now();
        connRef.current.send({ type: 'PING', payload: lastPingRef.current });
      }
    }, 1000);

    return () => clearInterval(pingInterval);
  };

  const handleIncomingConnection = (conn: any) => {


    // Add to pool
    if (!connPoolRef.current.find((c: any) => c.peer === conn.peer && c.label === conn.label)) {
      connPoolRef.current.push(conn);
    }

    if (!connRef.current) connRef.current = conn;

    transferAbortedRef.current = false;

    conn.on('open', () => {
      setConnStatus('receiver-connected');
      if (appStateRef.current === AppState.INTERRUPTED) {
        // Wait for RESUME signal
      } else {
        setAppState(AppState.TRANSFERRING);
        startTransferSequence(conn, selectedFilesRef.current);
      }
    });

    conn.on('data', (data: any) => {
      if (data.type === 'RESUME') {
        const { fileName, offset } = data.payload;
        const fileToResume = selectedFilesRef.current.find(f => f.file.name === fileName);
        if (fileToResume) {
          setAppState(AppState.TRANSFERRING);
          // We need to find index to resume correct progress bar too
          const idx = selectedFilesRef.current.findIndex(f => f.file.name === fileName);

          // Reset speed calc
          lastBytesRef.current = offset;
          lastTimeRef.current = Date.now();

          // Resume sending from offset
          handleOutgoingConnection(conn, selectedFilesRef.current, idx, offset);
        }
      } else if (data.type === 'ACK') {
        // acksReceived logic was removed/unused or needs ref
        // keeping empty for now
      } else if (data.type === 'RESUME_REQUEST') {
        // Seek and Resume
        const { fileName, offset } = data.payload;
        const fileIdx = selectedFilesRef.current.findIndex(f => f.file.name === fileName);
        if (fileIdx !== -1) {
          console.log(`Resuming ${fileName} from ${offset}`);

          handleOutgoingConnection(conn, selectedFilesRef.current, fileIdx, offset);
        }
      } else if (data.type === 'TEXT') {
        setChatMessages(prev => [...prev, { id: Date.now().toString(), sender: 'peer', text: data.payload, timestamp: Date.now() }]);
        if (!showChat) setShowChat(true);
      } else if (data.type === 'PING') {
        conn.send({ type: 'PONG', payload: data.payload });
      } else if (data.type === 'PONG') {
        const rtt = Date.now() - data.payload;
        setRtt(rtt);
      }
    });

    conn.on('close', () => {
      connPoolRef.current = connPoolRef.current.filter(c => c !== conn);

      if (connPoolRef.current.length === 0) {
        setConnStatus('disconnected');
        if (appStateRef.current === AppState.TRANSFERRING) {
          setAppState(AppState.INTERRUPTED);
          releaseWakeLock();
        }
      }
    });
  };

  useEffect(() => {
    initPeer();
    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(fourDigitCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Pro Feature: Scan folders
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {

      const files = await scanFiles(items);
      if (files.length > 0) {
        startSending(files);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {

      startSending(Array.from(e.dataTransfer.files));
    }
  };


  const startSending = (files: FileItem[] | File[] | FileList | null) => {
    if (!files || (files instanceof FileList && files.length === 0) || (Array.isArray(files) && files.length === 0)) return;

    // Clear previous session files
    setReceivedFiles([]);

    let itemsToSend: FileItem[] = [];

    if (files instanceof FileList) {
      // From file input
      itemsToSend = Array.from(files).map(f => ({ file: f, path: f.name }));
    } else if (Array.isArray(files)) {
      // Could be File[] or FileItem[]
      if (files.length > 0 && 'path' in files[0]) {
        itemsToSend = files as FileItem[];
      } else {
        itemsToSend = (files as File[]).map(f => ({ file: f, path: f.name }));
      }
    }

    const totalSize = itemsToSend.reduce((acc, f) => acc + f.file.size, 0);
    // Limit check removed for Ultimate Version

    setSelectedFiles(itemsToSend);
    setAppState(AppState.SENDING_WAITING);
    setConnStatus('waiting');
  };

  const startTransferSequence = (conn: any, files: FileItem[]) => {
    handleOutgoingConnection(conn, files, 0, 0);
  };

  const startReceiving = () => {
    setReceivedFiles([]); // Clear previous session files
    setAppState(AppState.RECEIVING_INPUT);
    if (peerRef.current?.open) setConnStatus('sender-connected');
  };

  const addToHistory = (type: 'sent' | 'received', files: { name: string; size: number }[]) => {
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const item: HistoryItem = {
      id: Date.now().toString(),
      type,
      timestamp: Date.now(),
      files,
      totalSize
    };
    setHistory(prev => [item, ...prev].slice(0, 10));
  };



  const handleOutgoingConnection = async (conn: any, files: FileItem[], startIdx: number = 0, startOffset: number = 0) => {
    setConnStatus('established');

    requestWakeLock();
    let acksReceived = startIdx;
    const filesToSend = files.slice(startIdx);

    // Ensure we use the pool
    const pool = connPoolRef.current.length > 0 ? connPoolRef.current : [conn];
    const poolSize = pool.length;

    // Listeners on primary only? 
    // We already attached listeners in handleIncomingConnection.

    lastBytesRef.current = startOffset;
    lastTimeRef.current = Date.now();

    // Global Chunk Index per file to allow reassembly
    let globalChunkIndex = 0;

    for (let i = 0; i < filesToSend.length; i++) {
      if (transferAbortedRef.current) break;
      const file = filesToSend[i];
      const actualIndex = startIdx + i;
      globalChunkIndex = 0;

      let offset = (i === 0) ? startOffset : 0;

      // Send Metadata on ALL channels to ensure they are ready? 
      // No, receiver is shared state. Send on primary.
      pool[0].send({ type: 'METADATA', payload: { name: file.file.name, size: file.file.size, type: file.file.type, lastModified: file.file.lastModified, path: file.path } });

      // BLAST MODE: Warp Speed Burst
      const BATCH_SIZE = 25; // WARP SPEED (25 chunks)
      let batchCount = 0;

      while (offset < file.file.size) {
        if (transferAbortedRef.current) break;

        // Check buffer of ALL connections? 
        const currentConn = pool[globalChunkIndex % poolSize];

        if (!currentConn.open) {
          // Don't fail immediately, wait for reconnect?
          // For now, loop will spin or fail. 
          // If primary is dead, we paused.
          if (appStateRef.current === AppState.RECONNECTING) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          // If not reconnecting yet, maybe trigger?
          // Let's trust the listener on 'close' to trigger state change.
          // But we should yield.
          await new Promise(r => setTimeout(r, 100));
          continue;
        }

        const threshold = isMobile() ? 134217728 : 268435456; // 128MB Mobile, 256MB PC
        if (currentConn.dataChannel.bufferedAmount > threshold) {
          await new Promise(r => setTimeout(r, 10));
          continue;
        }

        // QUANTUM: Adaptive Chunk Sizing
        const chunkStart = Date.now();
        const slice = file.file.slice(offset, offset + dynamicChunkSize);
        let buffer = await slice.arrayBuffer();
        let isCompressed = false;

        // Compression (CPU Saver: Only < 1MB text files)
        const isSmall = file.file.size < 1048576; // 1MB
        if (typeof CompressionStream !== 'undefined' && isSmall && (file.file.type.startsWith('text/') || file.file.type.includes('json') || file.file.type.includes('javascript') || file.file.type.includes('xml'))) {
          try {
            // @ts-ignore
            const cs = new CompressionStream('gzip');
            const writer = cs.writable.getWriter();
            writer.write(buffer);
            writer.close();
            const compressedBuffer = await new Response(cs.readable).arrayBuffer();
            if (compressedBuffer.byteLength < buffer.byteLength) {
              buffer = compressedBuffer;
              isCompressed = true;
            }
          } catch (e) { }
        }

        try {
          currentConn.send({ type: 'CHUNK', payload: buffer, compressed: isCompressed, index: globalChunkIndex });
        } catch (e) {
          setAppState(AppState.INTERRUPTED);
          return;
        }

        // Adaptive logic
        const chunkTime = Date.now() - chunkStart;
        if (chunkTime < 100 && dynamicChunkSize < MAX_CHUNK_SIZE) {
          setDynamicChunkSize(prev => Math.min(prev * 2, MAX_CHUNK_SIZE));
        } else if (chunkTime > 500 && dynamicChunkSize > MIN_CHUNK_SIZE) {
          setDynamicChunkSize(prev => Math.max(prev / 1.5, MIN_CHUNK_SIZE));
        }

        offset += dynamicChunkSize;
        globalChunkIndex++;
        batchCount++;

        // Speed Calc
        const now = Date.now();
        if (now - lastTimeRef.current > 500) {
          const bytesDiff = offset - lastBytesRef.current;
          const timeDiff = (now - lastTimeRef.current) / 1000;
          const speed = bytesDiff / timeDiff;
          setCurrentSpeed(speed);
          lastBytesRef.current = offset;
          lastTimeRef.current = now;
        }

        setProgress({
          fileName: `[${actualIndex + 1}/${files.length}] ${file.path}`,
          progress: Math.min(100, Math.round((offset / file.file.size) * 100)),
          speed: currentSpeed,
          bytesTransferred: Math.min(offset, file.file.size),
          totalBytes: file.file.size
        });

        // Yield briefly
        if (offset % (dynamicChunkSize * 20) === 0) await new Promise(r => setTimeout(r, 0));
      }

      if (!transferAbortedRef.current && offset >= file.file.size) {
        // Send COMPLETE only on Primary Shard (ordered)
        pool[0].send({ type: 'COMPLETE', payload: file.file.name });
        lastBytesRef.current = 0;
      }
    }

    if (!transferAbortedRef.current) {
      // Send ALL_DONE only on Primary Shard (ordered)
      pool[0].send({ type: 'ALL_DONE' });
      addToHistory('sent', files.map(f => ({ name: f.path, size: f.file.size })));
      setAppState(AppState.COMPLETED);
      releaseWakeLock();
    }
  };

  const connectToSender = (isResume: boolean = false) => {
    setError(null);
    setConnStatus('connecting');
    transferAbortedRef.current = false;

    // Reset pool
    connPoolRef.current.forEach(c => c.close());
    connPoolRef.current = [];
    if (connRef.current && connRef.current.open) connRef.current.close();

    const poolSize = isMobile() ? 4 : 8; // WARP SPEED (Mobile 4, PC 8)

    // Connect Loop
    for (let i = 0; i < poolSize; i++) {
      // Unordered for Warp Speed (Data), Ordered for Control (Primary)
      const conn = peerRef.current.connect(receiveCode, {
        label: `shard-${i}`,
        reliable: true,
        ordered: i === 0 // Primary shard must be ordered for control messages
      });

      connPoolRef.current.push(conn);

      if (i === 0) connRef.current = conn; // Primary

      conn.on('open', () => {
        // ... logic same as before but resilient ...
        console.log(`Shard ${i} connected`);
        if (i === 0) {
          setConnStatus('established');
          if (appStateRef.current === AppState.RECONNECTING) {
            // Resume Logic
            const currentSize = partialChunksRef.current.reduce((acc, chunk) => acc + (chunk ? chunk.byteLength : 0), 0);
            conn.send({
              type: 'RESUME_REQUEST',
              payload: {
                fileName: currentMetadataRef.current?.name,
                offset: currentSize
              }
            });
            setAppState(AppState.TRANSFERRING);
          } else {
            setAppState(AppState.TRANSFERRING);
            requestWakeLock();
          }
        }
      });

      conn.on('data', async (data: any) => {
        handleReceiverData(data, conn);
      });

      conn.on('close', () => {
        // If primary or too many close, trigger reconnect
        // For now, if primary dies, we panic and try to reconnect
        if (conn === connRef.current && appStateRef.current === AppState.TRANSFERRING) {
          console.log("Primary died, attempting auto-reconnect...");
          setAppState(AppState.RECONNECTING);
          setConnStatus('reconnecting');
          attemptReconnect();
        }
      });

      conn.on('error', (err: any) => {
        console.error("Conn Error:", err);
      });
    }


    if (!isResume) {
      partialChunksRef.current = [];
      currentMetadataRef.current = null;
      setReceivedFiles([]);
    }
  };

  const attemptReconnect = () => {
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 1 minute roughly

    const retry = setInterval(() => {
      attempts++;
      if (appStateRef.current !== AppState.RECONNECTING) {
        clearInterval(retry);
        return;
      }

      if (attempts > MAX_ATTEMPTS) {
        clearInterval(retry);
        setAppState(AppState.INTERRUPTED);
        setError("Connection lost indefinitely.");
        return;
      }

      console.log(`Reconnecting attempt ${attempts}...`);
      connectToSender(true);
    }, 2000);
  };

  const finalizeReceivedFile = (conn: any) => {
    if (!currentMetadataRef.current) return;

    const cleanChunks = partialChunksRef.current.filter(c => c !== undefined && c !== null);
    const blob = new Blob(cleanChunks, { type: currentMetadataRef.current.type });
    const newFile = { blob, name: currentMetadataRef.current.name, size: currentMetadataRef.current.size, path: currentMetadataRef.current.path || currentMetadataRef.current.name };

    setReceivedFiles(prev => {
      // DEBUG: Duplicate check removed to ensure file is added
      // if (prev.find(f => f.name === newFile.name && f.size === newFile.size)) return prev;
      const updated = [...prev, newFile];
      receivedFilesRef.current = updated; // Sync ref immediately for same-tick access
      return updated;
    });

    partialChunksRef.current = [];
    conn.send({ type: 'ACK', payload: currentMetadataRef.current.name });

    remoteCompleteRef.current = false;
    currentMetadataRef.current = null;
  };

  // Extract receiver data handler to separate function to reuse/clean up
  const handleReceiverData = async (data: any, conn: any) => {
    if (transferAbortedRef.current) return;

    if (data.type === 'METADATA') {
      currentMetadataRef.current = data.payload;
      partialChunksRef.current = [];

      lastBytesRef.current = 0;

      const completedCount = receivedFiles.length;
      setProgress({ fileName: `File ${completedCount + 1}: ${currentMetadataRef.current!.name}`, progress: 0, speed: 0, bytesTransferred: 0, totalBytes: currentMetadataRef.current!.size });
    } else if (data.type === 'CHUNK') {
      let chunkData = data.payload;

      if (data.compressed) {
        try {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(chunkData);
          writer.close();
          chunkData = await new Response(ds.readable).arrayBuffer();
        } catch (e) {
          console.error("Decompression error", e);
          return;
        }
      }

      // Indexed storage
      if (typeof data.index === 'number') {
        partialChunksRef.current[data.index] = chunkData;
      } else {
        partialChunksRef.current.push(chunkData);
      }

      const receivedSize = partialChunksRef.current.reduce((acc, c) => acc + (c ? c.byteLength : 0), 0);

      const now = Date.now();
      if (now - lastTimeRef.current > 500) {
        const bytesDiff = receivedSize - lastBytesRef.current;
        const timeDiff = (now - lastTimeRef.current) / 1000;
        const speed = bytesDiff / timeDiff;
        setCurrentSpeed(speed);
        currentSpeedRef.current = speed; // Update ref for closure access
        lastBytesRef.current = receivedSize;
        lastTimeRef.current = now;
      }

      // Calculate Estimated Time
      let estimatedTime = 0;
      const currentSpeed = currentSpeedRef.current;
      if (currentSpeed > 0 && currentMetadataRef.current) {
        estimatedTime = (currentMetadataRef.current.size - receivedSize) / currentSpeed;
      }

      if (currentMetadataRef.current) {
        const estimatedSize = receivedSize;
        setProgress(prev => prev ? {
          ...prev,
          progress: Math.min(100, Math.round((estimatedSize / currentMetadataRef.current!.size) * 100)),
          bytesTransferred: Math.min(estimatedSize, currentMetadataRef.current!.size),
          speed: currentSpeed,
          estimatedTime: estimatedTime
        } : null);

        // Check for completion if we received the COMPLETE signal previously
        if (remoteCompleteRef.current && receivedSize === currentMetadataRef.current.size) {
          finalizeReceivedFile(conn);
        }
      }
    } else if (data.type === 'COMPLETE') {
      console.log('COMPLETE message received for file:', currentMetadataRef.current?.name);

      if (!currentMetadataRef.current) return;

      remoteCompleteRef.current = true;

      const cleanChunks = partialChunksRef.current.filter(c => c !== undefined && c !== null);
      const receivedSize = cleanChunks.reduce((acc, c) => acc + c.byteLength, 0);

      // If we have all bytes, finalize immediately
      if (receivedSize === currentMetadataRef.current.size) {
        finalizeReceivedFile(conn);
      } else {
        console.log(`Waiting for straggler chunks... Received: ${receivedSize} / ${currentMetadataRef.current.size}`);
      }

    } else if (data.type === 'ALL_DONE') {
      console.log('ALL_DONE message received');

      // Guard: If still processing a file, do not finish yet
      if (currentMetadataRef.current) {
        console.log("ALL_DONE ignored, still processing file...");
        return;
      }

      // Force Sync state with Ref
      if (receivedFilesRef.current.length > 0) {
        const finalFiles = [...receivedFilesRef.current];
        setReceivedFiles(finalFiles);
        console.log("Synced receivedFiles from Ref:", finalFiles.length);
      }

      // Small delay to ensure state updates propagate before verify
      setTimeout(() => {
        setAppState(AppState.COMPLETED);
        releaseWakeLock();
      }, 100);
    } else if (data.type === 'TEXT') {
      setChatMessages(prev => [...prev, { id: Date.now().toString(), sender: 'peer', text: data.payload, timestamp: Date.now() }]);
      if (!showChat) setShowChat(true);
    }
  };



  useEffect(() => {
    if (appState === AppState.COMPLETED && receivedFiles.length > 0) {
      console.log('Transfer complete! Received files:', receivedFiles.length);
      console.log('Files:', receivedFiles.map(f => f.name));
      addToHistory('received', receivedFiles.map(f => ({ name: f.path, size: f.size })));

      // Auto-download files
      setTimeout(() => {
        const files = receivedFiles.length > 0 ? receivedFiles : receivedFilesRef.current;
        if (files.length === 1) {
          downloadSingle(files[0]);
        } else if (files.length > 1) {
          downloadAllAsZip();
        }
      }, 300);
    }
  }, [appState]);

  const downloadAllAsZip = async () => {
    const files = receivedFiles.length > 0 ? receivedFiles : receivedFilesRef.current;
    downloadFilesAsZip(files);
  };

  const downloadSingle = (file: { blob: Blob; name: string }) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetry = () => {
    setError(null);
    if (appState === AppState.RECEIVING_INPUT) {
      connectToSender(false);
    } else if (appState === AppState.INTERRUPTED) {
      if (selectedFiles.length > 0 && receivedFiles.length === 0 && partialChunksRef.current.length === 0) {
        setAppState(AppState.SENDING_WAITING);
        initPeer();
      } else {
        connectToSender(true);
      }
    }
    else if (!peerId) initPeer();
  };

  const abortTransfer = () => {
    transferAbortedRef.current = true;
    if (connRef.current) connRef.current.close();
    reset();
  };

  const reset = () => {
    setAppState(AppState.IDLE);
    setSelectedFiles([]);
    // Do not clear receivedFiles to allow download from history
    // setReceivedFiles([]); 
    setReceiveCode('');
    setProgress(null);
    setError(null);
    transferAbortedRef.current = false;
    partialChunksRef.current = [];
    currentMetadataRef.current = null;
    setConnStatus(peerRef.current?.open ? 'sender-connected' : 'disconnected');
    setChatMessages([]);
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !connRef.current || !connRef.current.open) return;
    connRef.current.send({ type: 'TEXT', payload: messageInput });
    setChatMessages(prev => [...prev, { id: Date.now().toString(), sender: 'me', text: messageInput, timestamp: Date.now() }]);
    setMessageInput('');
  };

  const downloadSingle = (file: { blob: Blob; path: string; name?: string; size?: number }) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path || file.name || 'downloaded-file';
    document.body.appendChild(a); // Append to body to ensure it works in all contexts
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFilesAsZip = async (files: { blob: Blob; path: string }[]) => {
    if (files.length === 0) return;
    setIsZipping(true);
    const zip = new JSZip();
    files.forEach(file => zip.file(file.path, file.blob));
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `send-anything-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setIsZipping(false);
  };

  const canDownloadHistoryItem = (item: HistoryItem) => {
    if (item.type !== 'received') return false;
    // Check if we have blobs for these files in memory
    const filesInMem = receivedFiles.length > 0 ? receivedFiles : receivedFilesRef.current;
    return item.files.every(f => filesInMem.some(rf => (rf.path === f.name || rf.name === f.name) && rf.size === f.size));
  };

  const handleHistoryDownload = (item: HistoryItem) => {
    const filesToDownload = receivedFiles.filter(rf => item.files.some(f => (rf.path === f.name || rf.name === f.name) && rf.size === f.size));
    if (filesToDownload.length === 0) return;

    if (filesToDownload.length === 1) {
      downloadSingle(filesToDownload[0]);
    } else {
      downloadFilesAsZip(filesToDownload);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const clearHistory = () => {
    setHistory([]);
  };



  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-[3000ms] ease-in-out overflow-x-hidden ${isDragging ? 'opacity-90 scale-[0.99]' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >



      {/* Incoming Call Modal */}


      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-blue-500/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-blue-500 rounded-[3rem] m-4 pointer-events-none">
          <div className="text-4xl sm:text-6xl font-black text-blue-600 animate-bounce">Drop Folder to Send!</div>
        </div>
      )}

      {/* Telemetry (Ultimate) */}
      {(appState === AppState.TRANSFERRING) && (
        <TelemetryPanel rtt={rtt} chunkSize={dynamicChunkSize} theme={theme} />
      )}

      {/* Chat Overlay */}
      {showChat && (appState === AppState.TRANSFERRING || appState === AppState.INTERRUPTED || appState === AppState.COMPLETED) && (
        <div className="fixed bottom-4 right-4 z-50 w-72 h-80 glass rounded-2xl flex flex-col shadow-2xl animate-entry">
          <div className="p-3 border-b border-black/10 flex items-center justify-between bg-black/5 dark:bg-white/5">
            <h3 className={`text-xs font-black uppercase tracking-widest ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Secure Chat</h3>
            <button onClick={() => setShowChat(false)} className="opacity-50 hover:opacity-100"><XIcon className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-2 rounded-xl text-xs font-medium ${msg.sender === 'me' ? 'bg-blue-500 text-white' : theme === 'dark' ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-800'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-black/10 flex gap-2">
            <input
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Type a secret..."
              className={`flex-1 bg-transparent text-xs p-2 rounded-lg outline-none ${theme === 'dark' ? 'text-white placeholder-slate-500' : 'text-black placeholder-slate-400'}`}
            />
            <button onClick={sendMessage} className="p-2 bg-blue-500 rounded-lg text-white hover:bg-blue-600"><SendIcon className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Chat Toggle Button */}
      {(appState === AppState.TRANSFERRING || appState === AppState.INTERRUPTED || appState === AppState.COMPLETED) && !showChat && (
        <button onClick={() => setShowChat(true)} className="fixed bottom-4 right-4 z-50 p-4 rounded-full bg-blue-500 text-white shadow-lg hover:scale-110 transition-transform">
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          Chat
        </button>
      )}



      <div className="fixed top-6 right-6 z-50 flex flex-col items-center gap-2">
        <button
          onClick={toggleTheme}
          className={`p-4 rounded-full transition-all duration-300 active:scale-95 ${theme === 'dark' ? 'bg-[#27272a] hover:bg-[#3f3f46]' : 'bg-slate-100 hover:bg-slate-200'}`}
        >
          {theme === 'dark' ? (
            <MoonIcon className="w-6 h-6 animate-entry" />
          ) : (
            <SunIcon className="w-6 h-6 text-amber-500 animate-entry animate-spin-slow" />
          )}
        </button>
        <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
          {theme}
        </span>
      </div>



      <header className="mb-12 text-center relative z-10 animate-entry px-4 flex flex-col items-center">
        <h1 className={`text-5xl sm:text-6xl font-bold tracking-tight mb-2 animate-float ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Send Anything</h1>
        <p className={`text-base font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          <TypingText text="Simple, secure, direct." speed={80} />
        </p>
      </header>

      <main className="w-full max-w-lg relative z-10 animate-entry px-4">
        <div className={`rounded-3xl p-8 transition-all duration-[3000ms] shadow-xl ${theme === 'dark' ? 'surface-dark' : 'surface-light'}`}>

          {(appState !== AppState.IDLE && appState !== AppState.COMPLETED) && (
            <div className="flex justify-center mb-6 sm:mb-8">
              <StatusBadge status={connStatus} theme={theme} />
            </div>
          )}

          {appState === AppState.IDLE && (
            <div className="flex flex-col gap-6 sm:gap-10 flex-1">
              {/* Vertical buttons only */}
              <div className="flex flex-col gap-4 my-auto w-full">
                <button
                  onClick={() => document.getElementById('fileInput')?.click()}
                  className={`w-full group flex items-center p-6 rounded-2xl border transition-all duration-[3000ms] hover:duration-200 active:scale-[0.98] ${theme === 'dark' ? 'bg-[#27272a] border-[#3f3f46] hover:bg-[#3f3f46] text-white' : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md text-slate-800'}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-6 transition-colors ${theme === 'dark' ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                    <SendIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <span className="block text-xl font-bold">Send Files</span>
                    <span className={`block text-xs font-medium mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Share securely with peers</span>
                  </div>
                  <input id="fileInput" type="file" multiple className="hidden" onChange={(e) => startSending(e.target.files)} />
                </button>

                <button
                  onClick={startReceiving}
                  className={`w-full group flex items-center p-6 rounded-2xl border transition-all duration-[3000ms] hover:duration-200 active:scale-[0.98] ${theme === 'dark' ? 'bg-[#27272a] border-[#3f3f46] hover:bg-[#3f3f46] text-white' : 'bg-white border-slate-200 hover:border-purple-400 hover:shadow-md text-slate-800'}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-6 transition-colors ${theme === 'dark' ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                    <ReceiveIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <span className="block text-xl font-bold">Receive Files</span>
                    <span className={`block text-xs font-medium mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Enter code to download</span>
                  </div>
                </button>
              </div>

              {history.length > 0 && (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-[3000ms] hover:duration-200 border ${theme === 'dark' ? 'bg-[#27272a] border-[#3f3f46] text-slate-300 hover:bg-[#3f3f46]' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    {showHistory ? 'Hide Transfer History' : 'Show Transfer History'}
                  </button>

                  {showHistory && (
                    <TransferHistory
                      history={history}
                      theme={theme}
                      onClear={clearHistory}
                      formatSize={formatSize}
                      onDownload={handleHistoryDownload}
                      canDownload={canDownloadHistoryItem}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {appState === AppState.SENDING_WAITING && (
            <div className="text-center py-4 flex flex-col flex-1 animate-entry">
              <h2 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Pairing Code</h2>
              <p className={`text-sm mb-6 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Share this code with the receiver.</p>

              <div className="flex flex-col items-center gap-6 mb-6">
                <div className="flex items-center justify-center gap-3">
                  {fourDigitCode ? fourDigitCode.split('').map((char, i) => (
                    <div key={i} className={`w-14 h-20 rounded-xl flex items-center justify-center text-4xl font-bold border transition-all ${theme === 'dark' ? 'bg-[#27272a] border-[#3f3f46] text-white' : 'bg-white border-slate-200 text-slate-900'}`}>{char}</div>
                  )) : <div className="w-10 h-10 animate-spin border-4 border-blue-500 border-t-transparent rounded-full" />}
                </div>

                <button
                  onClick={copyCodeToClipboard}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${isCopied ? 'bg-emerald-500 text-white shadow-lg' : theme === 'dark' ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'}`}
                >
                  {isCopied ? '✓ Copied' : 'Copy Code'}
                </button>

                {fourDigitCode && (
                  <div className="animate-entry">
                    <QRCodeDisplay url={`https://send-anything.web.app/?code=${fourDigitCode}`} theme={theme} />
                    <p className={`text-[9px] uppercase tracking-widest font-bold mt-2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Scan to Connect</p>
                  </div>
                )}
              </div>

              <div className="flex-1 max-h-40 overflow-y-auto mb-6 no-scrollbar">
                <FilePreview files={selectedFiles} onRemove={removeFile} theme={theme} />
              </div>

              <div className="mt-auto">
                <button
                  onClick={reset}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 mx-auto ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'}`}
                >
                  <XIcon className="w-3 h-3" /> Cancel Transfer
                </button>
              </div>
            </div>
          )}

          {appState === AppState.RECEIVING_INPUT && (
            <div className="text-center py-4 flex flex-col flex-1 animate-entry">
              <h2 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Enter Code</h2>
              <p className={`text-sm mb-8 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Enter the 4-digit code to connect.</p>

              <div className="mb-8 relative max-w-xs mx-auto w-full group">
                <input
                  type="text"
                  placeholder="0000"
                  maxLength={4}
                  value={receiveCode}
                  onChange={(e) => setReceiveCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className={`w-full border rounded-xl py-6 px-4 text-4xl tracking-[0.5em] font-bold text-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-[#27272a] border-[#3f3f46] text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-300'}`}
                />

                {error && (
                  <div className="mt-4 p-3 bg-rose-500/5 border border-rose-500/20 rounded-xl text-rose-500 text-[10px] font-black text-left flex items-start gap-2 uppercase tracking-tighter">
                    <XIcon className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1">
                      {error}
                      <button onClick={handleRetry} className="ml-2 underline hover:opacity-70">Retry</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 mt-auto">
                <button
                  onClick={() => connectToSender(false)}
                  disabled={receiveCode.length !== 4 || connStatus === 'connecting'}
                  className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${connStatus === 'connecting' ? 'bg-slate-500 text-white opacity-50' : theme === 'dark' ? 'bg-white text-black hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                >
                  {connStatus === 'connecting' ? 'Connecting...' : 'Ready'}
                </button>
                <button
                  onClick={reset}
                  className={`w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${theme === 'dark' ? 'bg-[#27272a] text-white hover:bg-[#3f3f46]' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {appState === AppState.TRANSFERRING && progress && (
            <div className="py-6 flex flex-col flex-1 justify-center text-center animate-entry">
              {/* Speed Graph (Pro Feature) */}
              <div className="mb-6 px-4">
                <SpeedGraph speed={currentSpeed} theme={theme} />
              </div>

              <div className="flex items-end justify-between mb-4 sm:mb-6">
                <div className="flex-1 min-w-0 mr-4 text-left">
                  <h2 className={`text-lg sm:text-2xl font-black truncate tracking-tighter transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                    {progress.fileName}
                  </h2>
                  <div className="flex items-center gap-4">
                    <div className="text-[9px] sm:text-[10px] font-black tracking-widest mt-1 flex items-center gap-2 uppercase">
                      <span className="text-blue-500">{formatSize(progress.bytesTransferred)}</span>
                      <span className={`opacity-20 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>/</span>
                      <span className={`${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>{formatSize(progress.totalBytes)}</span>
                    </div>
                    {progress.estimatedTime !== undefined && progress.estimatedTime > 0 && progress.progress < 100 && (
                      <div className="text-[9px] sm:text-[10px] font-black tracking-widest mt-1 text-slate-500 uppercase">
                        ~{Math.ceil(progress.estimatedTime)}s rem
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-blue-500 font-black text-3xl sm:text-5xl tabular-nums leading-none tracking-tighter">{progress.progress}%</span>
              </div>

              <div className={`w-full h-6 sm:h-8 rounded-full overflow-hidden mb-8 sm:mb-12 border p-1 relative shadow-inner ${theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress.progress}%` }}></div>
              </div>

              <div className="mt-2 flex flex-col items-center gap-6">
                <div className={`flex items-center gap-3 text-[9px] sm:text-[11px] font-black tracking-[0.2em] uppercase transition-all ${theme === 'dark' ? 'text-blue-400/80' : 'text-blue-500'}`}>
                  <div className="w-4 h-4 sm:w-5 sm:h-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Streaming Secure Data
                </div>
                <button
                  onClick={abortTransfer}
                  className={`px-8 py-3 rounded-xl text-[9px] font-black flex items-center gap-2 transition-all uppercase tracking-widest border ${theme === 'dark' ? 'bg-rose-500/5 text-rose-500 border-rose-500/20' : 'bg-white text-rose-500 border-rose-200 shadow-sm'}`}
                >
                  <XIcon className="w-4 h-4" /> Stop
                </button>
              </div>
            </div>
          )}

          {appState === AppState.INTERRUPTED && (
            <div className="py-6 flex flex-col flex-1 justify-center text-center animate-entry text-rose-500">
              <div className="w-16 h-16 sm:w-24 h-24 bg-rose-500/10 rounded-2xl mx-auto mb-6 flex items-center justify-center animate-pulse">
                <div className="text-4xl">âš ï¸</div>
              </div>
              <h2 className={`text-xl sm:text-2xl font-black mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Connection Lost</h2>
              <p className="mb-8 opacity-70 text-sm">Don't worry, your data is safe.</p>

              <button
                onClick={handleRetry}
                className="w-full py-4 bg-emerald-500 text-white rounded-xl font-black text-lg shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform"
              >
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                Resume Transfer
              </button>
              <button
                onClick={reset}
                className="mt-4 text-xs font-bold uppercase tracking-widest opacity-50 hover:opacity-100"
              >
                Cancel
              </button>
            </div>
          )}

          {appState === AppState.COMPLETED && (
            <div className="text-center py-2 my-auto flex flex-col flex-1 animate-entry">
              <div className="w-16 h-16 sm:w-24 h-24 bg-emerald-500/20 rounded-2xl sm:rounded-[2rem] flex items-center justify-center mx-auto mb-6 border-2 sm:border-4 border-emerald-500/30 shadow-xl shadow-emerald-500/10">
                <CheckIcon className="w-8 h-8 sm:w-12 sm:h-12 text-emerald-500" />
              </div>
              <h2 className={`text-2xl sm:text-4xl font-black mb-1 tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Success!</h2>
              <p className={`text-xs sm:text-base mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{receivedFiles.length > 0 ? `${receivedFiles.length} file${receivedFiles.length > 1 ? 's' : ''} received` : 'Delivered safely.'}</p>

              <div className="flex-1 max-h-40 sm:max-h-56 overflow-y-auto mb-6 px-1 no-scrollbar">
                {(() => {
                  // Robust retrieval of files to display
                  const filesToShow = receivedFiles.length > 0 ? receivedFiles :
                    (receivedFilesRef.current.length > 0 ? receivedFilesRef.current : selectedFiles);

                  // Force sync if we used Ref
                  if (receivedFiles.length === 0 && receivedFilesRef.current.length > 0) {
                    setTimeout(() => setReceivedFiles([...receivedFilesRef.current]), 100);
                  }

                  if (filesToShow.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center opacity-50">
                        <p className="text-xs font-bold">No files to display</p>
                      </div>
                    );
                  }

                  return filesToShow.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border mb-2 transition-all ${theme === 'dark' ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                      <div className="flex flex-col text-left min-w-0 pr-3">
                        <span className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>{('path' in item) ? item.path : item.name}</span>
                        <span className="text-[8px] font-black text-slate-500 opacity-60 uppercase">{formatSize(('size' in item) ? item.size : item.file.size)}</span>
                      </div>
                      {/* Always show download for items that have blobs (received files) */}
                      {'blob' in item && (
                        <button
                          onClick={() => downloadSingle(item as any)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all active:scale-95 ${theme === 'dark' ? 'bg-slate-700 text-blue-400 hover:bg-slate-600' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'}`}
                          title="Download File"
                        >
                          <SendIcon className="w-4 h-4 rotate-90" />
                          Download
                        </button>
                      )}
                    </div>
                  ))
                })()}
              </div>

              <div className="flex flex-col gap-3">
                {(() => {
                  const filesToCheck = receivedFiles.length > 0 ? receivedFiles : receivedFilesRef.current;
                  return (
                    <>
                      {filesToCheck.length > 1 && (
                        <button onClick={downloadAllAsZip} disabled={isZipping} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-base shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                          {isZipping ? 'Zipping...' : 'Download All (.zip)'}
                        </button>
                      )}
                      {filesToCheck.length === 1 && (
                        <button onClick={() => downloadSingle(filesToCheck[0])} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-base shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                          <SendIcon className="w-5 h-5 rotate-90" /> Download File
                        </button>
                      )}
                    </>
                  );
                })()}
                <button onClick={reset} className={`w-full py-4 rounded-xl font-black text-sm border ${theme === 'dark' ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200 shadow-sm'}`}>Done</button>
              </div>
            </div>
          )}
        </div>
      </main>


    </div>
  );
};

export default App;