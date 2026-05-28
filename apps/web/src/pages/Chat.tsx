import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { 
  Bot, 
  Mic, 
  SendHorizontal, 
  ArrowLeft, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  Landmark,
  Send,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useCache } from '../context/CacheContext';
import PinModal from '../components/PinModal';

interface Message {
  id: string;
  role: string;
  content: string;
  wasVoice: boolean;
  createdAt: string;
}

// Helpers to parse tags and extract JSON from model response
function extractJson(raw: string) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    const jsonStr = raw.substring(start, end + 1);
    return JSON.parse(jsonStr);
  }
  return JSON.parse(raw);
}

function parseMessageContent(content: string) {
  const paymentTag = '[PAYMENT_APPROVAL]';
  const withdrawTag = '[WITHDRAW_APPROVAL]';
  
  if (content.includes(paymentTag)) {
    const parts = content.split(paymentTag);
    const text = parts[0].trim();
    try {
      const data = extractJson(parts[1]);
      return { text, type: 'payment', data };
    } catch (e) {
      console.error('Failed to parse payment approval JSON:', e);
      return { text: content, type: 'text', data: null };
    }
  }
  
  if (content.includes(withdrawTag)) {
    const parts = content.split(withdrawTag);
    const text = parts[0].trim();
    try {
      const data = extractJson(parts[1]);
      return { text, type: 'withdraw', data };
    } catch (e) {
      console.error('Failed to parse withdraw approval JSON:', e);
      return { text: content, type: 'text', data: null };
    }
  }
  
  return { text: content, type: 'text', data: null };
}

export default function Chat() {
  const navigate = useNavigate();
  const { profile: merchant, withdrawalAccounts: accounts, fetchAccounts, updateBalance, loadingAccounts } = useCache();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showWhatsappBanner, setShowWhatsappBanner] = useState(true);
  
  const isFirstLoad = useRef(true);
  const [pendingApproval, setPendingApproval] = useState<any | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [mutedMessageIds, setMutedMessageIds] = useState<string[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // Clear speak states when unmounting / leaving page
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      setPlayingMessageId(null);
      setMutedMessageIds([]);
    };
  }, []);

  const handleSpeakerClick = (id: string, text: string) => {
    const isIdle = playingMessageId !== id && !mutedMessageIds.includes(id);
    const isPlaying = playingMessageId === id;
    const isMutedState = mutedMessageIds.includes(id);

    if (isIdle) {
      setPlayingMessageId(id);
      speakMessage(text, id);
    } else if (isPlaying) {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      }
      setMutedMessageIds(prev => [...prev, id]);
      setPlayingMessageId(null);
    } else if (isMutedState) {
      setMutedMessageIds(prev => prev.filter(mId => mId !== id));
      setPlayingMessageId(id);
      speakMessage(text, id);
    }
  };

  const speakMessage = async (content: string, messageId?: string) => {
    if (isMuted) return;

    try {
      const parsed = parseMessageContent(content);
      const textToSpeak = parsed.text;
      if (!textToSpeak) return;

      const isSwahili = /jambo|habari|mambo|asante/i.test(textToSpeak);
      const languageCode = isSwahili ? 'sw-KE' : 'en-US';

      let success = false;
      try {
        const res = await api.post('/agent/speak', { text: textToSpeak, languageCode });
        if (res.data.success && res.data.audioContent) {
          const audioUrl = `data:audio/mp3;base64,${res.data.audioContent}`;
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;
          
          audio.onended = () => {
            if (messageId) {
              setPlayingMessageId(prev => prev === messageId ? null : prev);
            }
          };
          audio.onerror = () => {
            if (messageId) {
              setPlayingMessageId(prev => prev === messageId ? null : prev);
            }
          };

          await audio.play();
          success = true;
        }
      } catch (err) {
        console.warn('Backend TTS failed, attempting client-side fallback:', err);
      }

      if (!success) {
        // Fallback: Web Speech API (speechSynthesis)
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel(); // Cancel any ongoing speech
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = languageCode;
          
          utterance.onend = () => {
            if (messageId) {
              setPlayingMessageId(prev => prev === messageId ? null : prev);
            }
          };
          utterance.onerror = () => {
            if (messageId) {
              setPlayingMessageId(prev => prev === messageId ? null : prev);
            }
          };

          // Try to select a regional voice if possible
          const voices = window.speechSynthesis.getVoices();
          if (voices && voices.length > 0) {
            const matchingVoice = voices.find(v => 
              v.lang.toLowerCase().startsWith(isSwahili ? 'sw' : 'en')
            );
            if (matchingVoice) {
              utterance.voice = matchingVoice;
            }
          }
          window.speechSynthesis.speak(utterance);
        } else {
          console.warn('Web Speech API (speechSynthesis) is not supported in this browser.');
          if (messageId) {
            setPlayingMessageId(null);
          }
        }
      }
    } catch (e) {
      console.warn('Speech synthesis failed entirely:', e);
      if (messageId) {
        setPlayingMessageId(null);
      }
    }
  };
  
  // Approval card action states
  const [cardStates, setCardStates] = useState<{ [msgId: string]: any }>({});
  
  // Withdrawal preview data states
  const [previewStates, setPreviewStates] = useState<{ [msgId: string]: any }>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<any>(null);

  const suggestions = [
    { text: 'What is my current balance?', value: 'What is my current balance?' },
    { text: "Show today's sales", value: "How much did I make today?" },
    { text: 'Show recent transactions', value: 'Show me my recent transactions' }
  ];

  // Fetch FX preview for a specific withdraw card
  const fetchWithdrawPreviewForCard = async (msgId: string, amountCusd: number) => {
    if (previewStates[msgId]?.loading || previewStates[msgId]?.data) return;

    setPreviewStates(prev => ({
      ...prev,
      [msgId]: { loading: true }
    }));

    try {
      const response = await api.get(`/withdraw/preview?amountCusd=${amountCusd}`);
      setPreviewStates(prev => ({
        ...prev,
        [msgId]: { loading: false, data: response.data }
      }));
    } catch (err: any) {
      console.error(`Preview calculation failed for msg ${msgId}:`, err);
      setPreviewStates(prev => ({
        ...prev,
        [msgId]: { loading: false, error: 'Failed to fetch conversion details' }
      }));
    }
  };

  // Trigger preview fetch for any withdraw cards inside current message logs
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.role === 'assistant') {
        const parsed = parseMessageContent(msg.content);
        if (parsed.type === 'withdraw' && parsed.data) {
          const amount = parseFloat(parsed.data.amountCusd);
          if (!isNaN(amount) && !previewStates[msg.id]) {
            fetchWithdrawPreviewForCard(msg.id, amount);
          }
        }
      }
    });
  }, [messages]);

  // Initial loads
  useEffect(() => {
    async function initChat() {
      fetchAccounts();
      
      try {
        const res = await api.get('/agent/history');
        const history = res.data.history;
        setMessages(history);

        if (history.length === 0) {
          // Empty chat: generate personalized data-driven custom greeting!
          setIsTyping(true);
          try {
            const welcomeRes = await api.post('/agent/message', { isInit: true, message: '__INIT__' });
            const welcomeMsg: Message = {
              id: Math.random().toString(),
              role: 'assistant',
              content: welcomeRes.data.reply,
              wasVoice: false,
              createdAt: new Date().toISOString()
            };
            setMessages([welcomeMsg]);
          } catch (e) {
            console.error('Failed to trigger custom welcome greeting:', e);
            const fallbackMsg: Message = {
              id: Math.random().toString(),
              role: 'assistant',
              content: 'Good morning! Welcome to SokoPay. How can I help you manage your business finances today?',
              wasVoice: false,
              createdAt: new Date().toISOString()
            };
            setMessages([fallbackMsg]);
          } finally {
            setIsTyping(false);
          }
        }
      } catch (err: any) {
        console.error(err);
        setError('Failed to load chat history.');
      }
    }
    initChat();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    if (messages.length === 0) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      setPlayingMessageId(lastMsg.id);
      speakMessage(lastMsg.content, lastMsg.id);
    }
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isTyping) return;
    
    const tempUserMessage: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: textToSend.trim(),
      wasVoice: false,
      createdAt: new Date().toISOString()
    };
    
    setMessages((prev) => [...prev, tempUserMessage]);
    setInputText('');
    setIsTyping(true);
    setError('');

    try {
      const res = await api.post('/agent/message', { message: textToSend.trim() });
      
      const tempAgentMessage: Message = {
        id: Math.random().toString(),
        role: 'assistant',
        content: res.data.reply,
        wasVoice: false,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, tempAgentMessage]);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'AI agent could not respond. Please try again.');
    } finally {
      setIsTyping(false);
    }
  };

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(blob);
    });
  };

  const startRecording = async () => {
    if (isRecording) return;
    setError('');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size < 1000) {
          setError('Recording was too short. Please try again.');
          return;
        }

        setIsTyping(true);
        try {
          const base64Audio = await convertBlobToBase64(audioBlob);
          const res = await api.post('/agent/voice', { audio: base64Audio });
          
          const tempUserMessage: Message = {
            id: Math.random().toString(),
            role: 'user',
            content: res.data.transcript,
            wasVoice: true,
            createdAt: new Date().toISOString()
          };

          const tempAgentMessage: Message = {
            id: Math.random().toString(),
            role: 'assistant',
            content: res.data.reply,
            wasVoice: false,
            createdAt: new Date().toISOString()
          };

          setMessages((prev) => [...prev, tempUserMessage, tempAgentMessage]);
        } catch (err: any) {
          console.error(err);
          setError(err.response?.data?.error || 'Failed to transcribe voice note.');
        } finally {
          setIsTyping(false);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setError('Could not access microphone. Please grant permission.');
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    clearInterval(durationIntervalRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Card execution handlers
  const handleCancelCard = (msgId: string) => {
    setCardStates(prev => ({
      ...prev,
      [msgId]: { ...prev[msgId], status: 'cancelled' }
    }));
  };

  const handleConfirmPayment = (msgId: string, recipientAddress: string, amountCusd: number, notes: string) => {
    setPendingApproval({
      type: 'payment',
      msgId,
      recipientAddress,
      amountCusd,
      notes
    });
    setIsPinModalOpen(true);
  };

  const executeConfirmPayment = async (msgId: string, recipientAddress: string, amountCusd: number, notes: string, pin: string) => {
    setCardStates(prev => ({
      ...prev,
      [msgId]: { ...prev[msgId], status: 'loading' }
    }));

    try {
      const response = await api.post('/payments/send', {
        recipientAddress,
        amountCusd,
        notes: notes || 'Confirmed via AI Agent',
        paymentPassword: pin
      });

      setCardStates(prev => ({
        ...prev,
        [msgId]: { 
          ...prev[msgId], 
          status: 'success', 
          txHash: response.data.txHash 
        }
      }));

      // Reload balance context
      updateBalance();
    } catch (err: any) {
      console.error('AI Card payment failure:', err);
      setCardStates(prev => ({
        ...prev,
        [msgId]: { 
          ...prev[msgId], 
          status: 'error', 
          errorMsg: err.response?.data?.error || 'Payment execution failed' 
        }
      }));
    }
  };

  const handleConfirmWithdrawal = (msgId: string, amountCusd: number, withdrawalAccountId: string) => {
    if (!withdrawalAccountId) {
      setCardStates(prev => ({
        ...prev,
        [msgId]: { 
          ...prev[msgId], 
          status: 'error', 
          errorMsg: 'Please link a withdrawal account first' 
        }
      }));
      return;
    }
    setPendingApproval({
      type: 'withdraw',
      msgId,
      amountCusd,
      withdrawalAccountId
    });
    setIsPinModalOpen(true);
  };

  const executeConfirmWithdrawal = async (msgId: string, amountCusd: number, withdrawalAccountId: string, pin: string) => {
    setCardStates(prev => ({
      ...prev,
      [msgId]: { ...prev[msgId], status: 'loading' }
    }));

    try {
      const response = await api.post('/withdraw/execute', {
        amountCusd,
        withdrawalAccountId,
        paymentPassword: pin
      });

      setCardStates(prev => ({
        ...prev,
        [msgId]: { 
          ...prev[msgId], 
          status: 'success', 
          txHash: response.data.txHash,
          trackingId: response.data.offramp?.trackingId 
        }
      }));

      // Reload balance context
      updateBalance();
    } catch (err: any) {
      console.error('AI Card withdrawal failure:', err);
      setCardStates(prev => ({
        ...prev,
        [msgId]: { 
          ...prev[msgId], 
          status: 'error', 
          errorMsg: err.response?.data?.error || 'Withdrawal execution failed' 
        }
      }));
    }
  };

  // Card UI renderers
  const renderPaymentApprovalCard = (msg: Message, data: any) => {
    const cardState = cardStates[msg.id];
    const status = cardState?.status || 'pending';
    const isPending = status === 'pending';
    const isSuccess = status === 'success';
    const isCancelled = status === 'cancelled';
    const isLoading = status === 'loading';
    const isError = status === 'error';
    const errorMsg = cardState?.errorMsg;

    return (
      <div className="mt-3 p-4 bg-bg-card border-2 border-border rounded-xl shadow-card text-text space-y-3 font-body">
        <div className="flex justify-between items-center pb-2 border-b border-border">
          <span className="text-[10px] uppercase font-black tracking-wider text-text-muted flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-accent" /> Payment Request
          </span>
          {isPending && <span className="bg-warning/20 text-warning border border-warning/30 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Review</span>}
          {isSuccess && <span className="bg-success/20 text-success border border-success/30 text-[8px] font-black uppercase px-2 py-0.5 rounded-full font-mono">Confirmed</span>}
          {isCancelled && <span className="bg-text-muted/20 text-text-muted border border-text-muted/30 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Cancelled</span>}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted font-semibold">To:</span>
            <span className="font-bold">{data.recipientName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-muted font-semibold">Address:</span>
            <span className="font-mono text-[9px] bg-bg px-1.5 py-0.5 rounded border border-border">
              {data.recipientAddress.substring(0, 6)}...{data.recipientAddress.substring(38)}
            </span>
          </div>
          {data.notes && (
            <div className="flex justify-between">
              <span className="text-text-muted font-semibold">Notes:</span>
              <span className="italic text-text-muted">"{data.notes}"</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-dashed border-border items-center">
            <span className="text-text-muted font-semibold">Amount:</span>
            <span className="text-sm font-display font-black text-accent">{Number(data.amountCusd).toFixed(2)} cUSD</span>
          </div>
        </div>

        {isError && (
          <div className="p-2 bg-error/10 border border-error text-error text-[10px] font-bold rounded flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg || 'Transaction failed.'}</span>
          </div>
        )}

        {isPending && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleCancelCard(msg.id)}
              className="flex-1 py-2 px-3 border-2 border-border bg-bg hover:bg-border text-xs font-bold rounded transition-colors active:translate-x-[0.5px] active:translate-y-[0.5px]"
            >
              Cancel
            </button>
            <button
              onClick={() => handleConfirmPayment(msg.id, data.recipientAddress, data.amountCusd, data.notes)}
              className="flex-1 py-2 px-3 bg-accent text-white hover:bg-accent-hover text-xs font-bold rounded shadow-[2px_2px_0px_#1A1208] transition-all active:translate-x-[0.5px] active:translate-y-[0.5px] active:shadow-none"
            >
              Confirm Transfer
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center items-center py-2 text-xs font-bold text-text-muted gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" /> Processing...
          </div>
        )}

        {isSuccess && (
          <div className="bg-success/10 border border-success p-2 rounded text-[11px] text-success space-y-1 font-semibold">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle className="w-4 h-4 shrink-0" /> Transfer completed!
            </div>
            {cardState.txHash && (
              <a
                href={`https://celoscan.io/tx/${cardState.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-mono text-[9px] block hover:text-success/80 mt-1"
              >
                View Celoscan Tx Hash
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderWithdrawalApprovalCard = (msg: Message, data: any) => {
    const cardState = cardStates[msg.id];
    const status = cardState?.status || 'pending';
    const isPending = status === 'pending';
    const isSuccess = status === 'success';
    const isCancelled = status === 'cancelled';
    const isLoading = status === 'loading';
    const isError = status === 'error';
    const errorMsg = cardState?.errorMsg;

    const previewState = previewStates[msg.id];
    const previewLoading = previewState?.loading;
    const previewData = previewState?.data;

    // Use default account or selected account
    const currentSelectedAccountId = cardState?.selectedAccountId || (accounts.find(a => a.isDefault)?.id || accounts[0]?.id);

    return (
      <div className="mt-3 p-4 bg-bg-card border-2 border-border rounded-xl shadow-card text-text space-y-3 font-body">
        <div className="flex justify-between items-center pb-2 border-b border-border">
          <span className="text-[10px] uppercase font-black tracking-wider text-text-muted flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5 text-accent" /> Withdrawal Check
          </span>
          {isPending && <span className="bg-warning/20 text-warning border border-warning/30 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Review</span>}
          {isSuccess && <span className="bg-success/20 text-success border border-success/30 text-[8px] font-black uppercase px-2 py-0.5 rounded-full font-mono">Settled</span>}
          {isCancelled && <span className="bg-text-muted/20 text-text-muted border border-text-muted/30 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Cancelled</span>}
        </div>

        {accounts.length === 0 && !loadingAccounts ? (
          <div className="text-xs text-error font-bold text-center py-2 space-y-2">
            <p>No linked withdrawal accounts found.</p>
            <button
              onClick={() => navigate('/withdraw')}
              className="px-3 py-1 bg-accent text-white font-bold text-[10px] rounded"
            >
              Link Account First
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {/* Account Dropdown */}
              <div>
                <label className="block text-[8px] font-extrabold uppercase text-text-muted mb-0.5">Off-ramp Account</label>
                {isPending ? (
                  <select
                    value={currentSelectedAccountId}
                    onChange={(e) => {
                      setCardStates(prev => ({
                        ...prev,
                        [msg.id]: {
                          ...prev[msg.id],
                          selectedAccountId: e.target.value
                        }
                      }));
                    }}
                    className="w-full text-xs p-1.5 bg-bg border border-border rounded font-bold"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.type === 'mpesa' ? `M-Pesa (${acc.mpesaNumber})` : `${acc.bankName} - ${acc.accountNumber}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs font-bold font-mono">
                    {(() => {
                      const target = accounts.find(a => a.id === currentSelectedAccountId);
                      if (!target) return 'Withdrawal Account';
                      return target.type === 'mpesa' ? `M-Pesa (${target.mpesaNumber})` : `${target.bankName} (${target.accountNumber})`;
                    })()}
                  </div>
                )}
              </div>

              {/* Settlement Preview Details */}
              <div className="space-y-1 text-xs pt-1.5 border-t border-dashed border-border">
                <div className="flex justify-between">
                  <span className="text-text-muted">cUSD Amount:</span>
                  <span className="font-bold">{Number(data.amountCusd).toFixed(2)} cUSD</span>
                </div>

                {previewLoading ? (
                  <div className="flex items-center justify-center py-1 text-[10px] text-text-muted gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-accent" /> Calculating FX settlement...
                  </div>
                ) : previewData ? (
                  <div className="space-y-0.5 pt-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Rate (Live):</span>
                      <span className="font-mono">1 cUSD = {previewData.rate.toFixed(2)} {previewData.currency}</span>
                    </div>
                    <div className="flex justify-between text-error">
                      <span>Off-ramp Fee:</span>
                      <span>-{previewData.feeLocal.toFixed(2)} {previewData.currency}</span>
                    </div>
                    <div className="flex justify-between text-success font-bold mt-1 pt-1 border-t border-border/10">
                      <span>Payout Value:</span>
                      <span>{previewData.netSettlementLocal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {previewData.currency}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {isError && (
              <div className="p-2 bg-error/10 border border-error text-error text-[10px] font-bold rounded flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg || 'Withdrawal failed.'}</span>
              </div>
            )}

            {isPending && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleCancelCard(msg.id)}
                  className="flex-1 py-2 px-3 border-2 border-border bg-bg hover:bg-border text-xs font-bold rounded transition-colors active:translate-x-[0.5px] active:translate-y-[0.5px]"
                >
                  Cancel
                </button>
                <button
                  disabled={!currentSelectedAccountId}
                  onClick={() => handleConfirmWithdrawal(msg.id, data.amountCusd, currentSelectedAccountId)}
                  className="flex-1 py-2 px-3 bg-accent text-white hover:bg-accent-hover text-xs font-bold rounded shadow-[2px_2px_0px_#1A1208] transition-all active:translate-x-[0.5px] active:translate-y-[0.5px] active:shadow-none"
                >
                  Confirm Payout
                </button>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center items-center py-2 text-xs font-bold text-text-muted gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" /> Processing...
              </div>
            )}

            {isSuccess && (
              <div className="bg-success/10 border border-success p-2 rounded text-[11px] text-success space-y-1 font-semibold">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle className="w-4 h-4 shrink-0" /> Withdrawal processed!
                </div>
                {cardState.trackingId && <p className="text-[10px] text-success/80">Tracking ID: {cardState.trackingId}</p>}
                {cardState.txHash && (
                  <a
                    href={`https://celoscan.io/tx/${cardState.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-mono text-[9px] block hover:text-success/80 mt-1"
                  >
                    View Celoscan Tx Hash
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#FAF7F2] font-body text-[#1A1208]">
      {/* Header */}
      <header className="bg-[#FAF7F2] border-b border-[#DDD5C5] h-16 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-3 py-1 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md font-bold hover:bg-border transition-colors shadow-[2px_2px_0px_#1A1208] text-sm active:translate-x-[0.5px] active:translate-y-[0.5px] flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#C4622D]" />
            <div>
              <h1 className="font-display font-black text-sm uppercase tracking-wider leading-none">Financial Agent</h1>
              <span className="text-[10px] text-[#5C6B3A] font-extrabold uppercase">● Online</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setIsMuted(!isMuted);
          }}
          className="px-3 py-1 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md font-bold hover:bg-border transition-all shadow-[2px_2px_0px_#1A1208] text-xs active:translate-x-[0.5px] active:translate-y-[0.5px] flex items-center gap-1.5 text-[#1A1208]"
          title={isMuted ? "Unmute Voice" : "Mute Voice"}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-3.5 h-3.5 text-[#B5271E]" />
              <span className="font-mono uppercase tracking-wider font-extrabold">Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 text-[#5C6B3A]" />
              <span className="font-mono uppercase tracking-wider font-extrabold">Voice On</span>
            </>
          )}
        </button>
      </header>

      {/* WhatsApp Bot Banner */}
      {showWhatsappBanner && (
        <div className="bg-[#E4ECE0] border-b-2 border-b-[#1A1208] p-3 text-xs flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <div>
              <span className="font-bold text-[#1A1208]">WhatsApp Bot Layer (Coming Soon)</span>
              <p className="text-[10px] text-[#7A6B55] font-semibold mt-0.5">Control your business finances and trigger payouts offline via WhatsApp commands. Coming Q3.</p>
            </div>
          </div>
          <button 
            onClick={() => setShowWhatsappBanner(false)}
            className="text-[10px] font-bold text-[#1A1208] hover:underline bg-white/50 border border-[#DDD5C5] px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-[#B5271E]/10 border-b-2 border-b-[#B5271E] text-[#B5271E] p-3 text-center font-bold text-xs shrink-0 select-none flex items-center justify-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center text-[#7A6B55] max-w-sm mx-auto space-y-4">
            <Bot className="w-12 h-12 text-[#C4622D] animate-bounce" />
            <div>
              <h2 className="font-display font-bold text-lg text-[#1A1208]">Good morning, {merchant?.businessName || 'Amaka'}!</h2>
              <p className="text-xs mt-1.5 leading-relaxed font-semibold text-[#1A1208]">
                Loading personalized greeting...
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const parsed = isUser ? { text: msg.content, type: 'text', data: null } : parseMessageContent(msg.content);
            
            return (
              <div 
                key={msg.id}
                className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-xl p-3.5 border-2 border-[#1A1208] ${
                    isUser 
                      ? 'bg-[#C4622D] text-[#FAF7F2] rounded-tr-none shadow-[2px_2px_0px_#1A1208]' 
                      : 'bg-[#F2EDE4] text-[#1A1208] rounded-tl-none shadow-[2px_2px_0px_#1A1208]'
                  }`}
                >
                  <div className="text-xs font-semibold leading-relaxed whitespace-pre-wrap font-body">
                    {msg.wasVoice && (
                      <span className="block text-[10px] font-black text-amber-100 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5" /> Voice Transcript:
                      </span>
                    )}
                    <div className="flex justify-between items-start gap-3">
                      <p className="flex-1">{parsed.text}</p>
                      {!isUser && (() => {
                        const isIdle = playingMessageId !== msg.id && !mutedMessageIds.includes(msg.id);
                        const isPlaying = playingMessageId === msg.id;
                        const isMutedState = mutedMessageIds.includes(msg.id);
                        
                        let buttonClass = "speaker-btn shrink-0 p-1.5 rounded-full transition-all border border-[#1A1208]/15 ";
                        let icon = <Volume2 className="w-3.5 h-3.5" />;
                        let tooltip = "Tap to hear";

                        if (isPlaying) {
                          buttonClass += "playing bg-[#FCEAE2] text-[#C4622D]";
                          icon = <Volume2 className="w-3.5 h-3.5 text-[#C4622D] animate-pulse" />;
                          tooltip = "Tap to stop";
                        } else if (isMutedState) {
                          buttonClass += "muted bg-[#FAF7F2] text-[#7A6B55]";
                          icon = <VolumeX className="w-3.5 h-3.5 text-[#7A6B55]" />;
                          tooltip = "Tap to hear again";
                        } else {
                          buttonClass += "bg-white/60 hover:bg-white text-[#1A1208]";
                        }

                        return (
                          <div className="flex flex-col items-center shrink-0">
                            <button
                              onClick={() => handleSpeakerClick(msg.id, parsed.text)}
                              className={buttonClass}
                              title={tooltip}
                            >
                              {icon}
                            </button>
                            {isPlaying && (
                              <span className="text-[9px] font-mono text-[#C4622D] font-bold mt-1 tracking-wider uppercase animate-pulse">
                                speaking
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Render Interactive Action Cards */}
                    {parsed.type === 'payment' && parsed.data && renderPaymentApprovalCard(msg, parsed.data)}
                    {parsed.type === 'withdraw' && parsed.data && renderWithdrawalApprovalCard(msg, parsed.data)}
                  </div>
                  
                  <span className={`text-[8px] font-bold block mt-1.5 text-right ${isUser ? 'text-[#FAF7F2]/70' : 'text-[#7A6B55]'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Typing state */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl rounded-tl-none p-3.5 shadow-[2px_2px_0px_#1A1208] flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-[#1A1208] rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-[#1A1208] rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1.5 h-1.5 bg-[#1A1208] rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions and Input footer */}
      <footer className="bg-[#FAF7F2] border-t border-[#DDD5C5] p-4 shrink-0 space-y-3">
        {/* Suggestion Chips */}
        {messages.length < 5 && !isTyping && (
          <div className="flex gap-2 overflow-x-auto pb-1 max-w-[100%] scrollbar-none">
            {suggestions.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(chip.value)}
                className="px-3 py-1.5 border-2 border-[#1A1208] bg-[#F2EDE4] hover:bg-border text-xs font-black uppercase tracking-wider rounded-full transition-colors whitespace-nowrap shadow-[1.5px_1.5px_0px_#1A1208] active:translate-x-[0.5px] active:translate-y-[0.5px] active:shadow-[1px_1px_0px_#1A1208]"
              >
                {chip.text}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="flex items-center gap-2 max-w-[800px] mx-auto w-full">
          {/* Audio Hold-to-Talk Recording Button */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            className={`w-12 h-12 border-2 border-[#1A1208] rounded-md flex items-center justify-center transition-all select-none ${
              isRecording 
                ? 'bg-[#B5271E] text-white animate-pulse scale-105 border-dashed shadow-none' 
                : 'bg-[#F2EDE4] text-[#1A1208] hover:bg-border shadow-[2px_2px_0px_#1A1208]'
            }`}
            aria-label="Hold to record audio note"
          >
            {isRecording ? (
              <span className="font-mono text-xs font-black">{recordingDuration}s</span>
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          {/* Text Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage(inputText);
              }}
              placeholder={isRecording ? "Listening..." : "Message your financial agent..."}
              disabled={isRecording}
              className="w-full px-4 py-3 bg-[#F2EDE4] border-2 border-[#1A1208] rounded-md font-bold focus:outline-none focus:border-[#C4622D] pr-12 transition-colors disabled:opacity-50"
            />
            {/* Send Button */}
            <button
              onClick={() => handleSendMessage(inputText)}
              disabled={!inputText.trim() || isTyping}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:scale-115 transition-transform disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Send message"
            >
              <SendHorizontal className="w-5 h-5 text-[#C4622D]" />
            </button>
          </div>
        </div>

        <p className="text-[9px] text-[#7A6B55] text-center font-bold">
          {isRecording ? "RELEASE BUTTON TO SEND VOICE NOTE" : "HOLD MIC BUTTON TO SPEAK COGNITIVE ACTIONS"}
        </p>
      </footer>

      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingApproval(null);
        }}
        onSuccess={async (pin) => {
          if (!pendingApproval) return;
          if (pendingApproval.type === 'payment') {
            await executeConfirmPayment(
              pendingApproval.msgId,
              pendingApproval.recipientAddress,
              pendingApproval.amountCusd,
              pendingApproval.notes,
              pin
            );
          } else if (pendingApproval.type === 'withdraw') {
            await executeConfirmWithdrawal(
              pendingApproval.msgId,
              pendingApproval.amountCusd,
              pendingApproval.withdrawalAccountId,
              pin
            );
          }
          setIsPinModalOpen(false);
          setPendingApproval(null);
        }}
        description={
          pendingApproval?.type === 'payment'
            ? `Confirm payment of ${pendingApproval.amountCusd} cUSD to ${pendingApproval.recipientAddress.substring(0, 6)}...`
            : `Confirm withdrawal of ${pendingApproval?.amountCusd} cUSD`
        }
      />
    </div>
  );
}
