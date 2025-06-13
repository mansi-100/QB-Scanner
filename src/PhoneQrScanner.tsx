
import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';

const PhoneQrScanner: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [scanned, setScanned] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [lastScannedContent, setLastScannedContent] = useState<string>('');
  const [smsMessage, setSmsMessage] = useState<string>('');
  const [isSendingSms, setIsSendingSms] = useState<boolean>(false);
  const [smsAttempted, setSmsAttempted] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smsFormRef = useRef<HTMLFormElement>(null);

  // Check if device supports SMS
  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  // Check camera permission status
  const checkCameraPermission = async () => {
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setPermissionState(permission.state);
        
        permission.onchange = () => {
          setPermissionState(permission.state);
        };
      }
    } catch (err) {
      console.log('Permission API not supported');
    }
  };

  // Request camera permission
  const requestCameraPermission = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      // Store the stream reference
      streamRef.current = stream;
      
      // Permission granted, stop the stream for now
      stopStream();
      
      setPermissionState('granted');
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera access in your browser settings.');
        setPermissionState('denied');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Camera access failed: ' + err.message);
      }
      return false;
    }
  };

  // Stop the media stream
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Extract phone number from text using comprehensive regex
  const extractPhoneNumber = (text: string): string | null => {
    // Multiple phone number patterns to catch various formats
    const phonePatterns = [
      /(\+\d{1,3}[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g, // Standard formats
      /(\+\d{1,3}[-.\s]?)?[0-9]{10,15}/g, // International format
      /(\+\d{1,3}[-.\s]?)?\d{4}[-.\s]?\d{3}[-.\s]?\d{3}/g, // Alternative format
      /(\+\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{4}[-.\s]?\d{4}/g, // Another format
      /tel:\+?[0-9\-\s\(\)]+/gi, // tel: protocol
      /phone:\+?[0-9\-\s\(\)]+/gi, // phone: prefix
    ];

    for (const pattern of phonePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Clean the phone number - remove prefixes and non-digit characters except +
          let phone = match.replace(/^(tel:|phone:)/i, '').trim();
          
          // Check if it already has a + at the beginning
          const hasPlus = phone.startsWith('+');
          
          // Remove all non-digit characters except + at the beginning
          if (hasPlus) {
            phone = '+' + phone.substring(1).replace(/[^\d]/g, '');
          } else {
            phone = phone.replace(/[^\d]/g, '');
          }
          
          // Validate length
          const digitCount = phone.replace(/^\+/, '').length;
          if (digitCount >= 10 && digitCount <= 15) {
            // Return the phone number as is if it already has +, otherwise return without +
            // Only add + if it looks like an international number (11+ digits without +)
            if (hasPlus) {
              return phone;
            } else if (digitCount >= 11) {
              return '+' + phone;
            } else {
              return phone; // Return local number without +
            }
          }
        }
      }
    }

    // Fallback: extract any sequence of digits that looks like a phone
    const digitSequence = text.replace(/[^\d]/g, '');
    if (digitSequence.length >= 10 && digitSequence.length <= 15) {
      // For fallback, only add + if it's 11+ digits (likely international)
      return digitSequence.length >= 11 ? '+' + digitSequence : digitSequence;
    }

    return null;
  };

  // Scan video frame for QR codes
  const scanVideoFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    
    if (code && code.data) {
      setLastScannedContent(code.data);
      const phoneMatch = extractPhoneNumber(code.data);
      if (phoneMatch) {
        setPhoneNumber(phoneMatch);
        setScanned(true);
        stopScanning();
        return;
      } else {
        // Show what we found for debugging
        setError(`QR Code detected but no phone number found. Content: "${code.data.substring(0, 100)}..."`);
      }
    }
  };

  // Start camera scanning
  const startScanning = async () => {
    try {
      setError('');
      setIsScanning(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        
        // Start scanning frames more frequently for better detection
        scanIntervalRef.current = window.setInterval(scanVideoFrame, 200); // Scan every 200ms
      }
    } catch (err: any) {
      setError('Failed to start camera: ' + err.message);
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    stopStream();
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  // Process QR code from uploaded file
  const processFileUpload = async (file: File) => {
    setIsProcessingFile(true);
    setError('');
    
    try {
      const img = new Image();
      const canvas = canvasRef.current;
      
      if (!canvas) {
        throw new Error('Canvas not available');
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      const imageUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        
        if (code && code.data) {
          setLastScannedContent(code.data);
          const phoneMatch = extractPhoneNumber(code.data);
          if (phoneMatch) {
            setPhoneNumber(phoneMatch);
            setScanned(true);
          } else {
            setError(`QR code found but no valid phone number detected. Content: "${code.data.substring(0, 100)}${code.data.length > 100 ? '...' : ''}"`);
          }
        } else {
          setError('No QR code detected in the image. Please ensure the image contains a clear, well-lit QR code.');
        }
        
        URL.revokeObjectURL(imageUrl);
        setIsProcessingFile(false);
      };
      
      img.onerror = () => {
        setError('Failed to load image file. Please try a different image.');
        URL.revokeObjectURL(imageUrl);
        setIsProcessingFile(false);
      };
      
      img.src = imageUrl;
      
    } catch (err: any) {
      setError('Failed to process file: ' + err.message);
      setIsProcessingFile(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        processFileUpload(file);
      } else {
        setError('Please select an image file (JPG, PNG, GIF, WebP, etc.)');
      }
    }
  };

  // Manual phone number input
  const handleManualInput = (input: string) => {
    const phoneMatch = extractPhoneNumber(input);
    if (phoneMatch) {
      setPhoneNumber(phoneMatch);
      setScanned(true);
      setError('');
    } else {
      setError("Please enter a valid phone number (10-15 digits with optional country code).");
    }
  };

  // Send SMS using the SMS API
  const sendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingSms(true);
    setError('');
    setSmsAttempted(false);
    
    try {
      // Check if phone number is valid
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new Error('Invalid phone number');
      }
      
      // Check if message is not empty
      if (!smsMessage.trim()) {
        throw new Error('Message cannot be empty');
      }
      
      // Create the SMS link
      const smsLink = `sms:${phoneNumber}?body=${encodeURIComponent(smsMessage)}`;
      
      console.log('SMS link created:', smsLink);
      
      // Check if on mobile device
      if (!isMobileDevice()) {
        setError('⚠️ SMS links work best on mobile devices. On desktop, you may need to copy the phone number manually.');
      }
      
      // Attempt to open SMS app
      try {
        window.location.href = smsLink;
        setSmsAttempted(true);
        
        // Show success message after attempting to open SMS app
        setTimeout(() => {
          if (!error) {
            setError(''); // Clear any previous errors
          }
        }, 1000);
        
      } catch (linkError) {
        console.error('Failed to open SMS link:', linkError);
        throw new Error('Failed to open SMS application. Please copy the phone number and message manually.');
      }
      
    } catch (err: any) {
      setError('Failed to send SMS: ' + err.message);
    } finally {
      setIsSendingSms(false);
    }
  };

  const resetScanner = () => {
    setPhoneNumber('');
    setScanned(false);
    setError('');
    setLastScannedContent('');
    setSmsMessage('');
    setSmsAttempted(false);
    stopScanning();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (smsFormRef.current) {
      smsFormRef.current.reset();
    }
  };

  useEffect(() => {
    checkCameraPermission();
    return () => {
      stopScanning();
    };
  }, []);

  const styles = {
    container: {
      maxWidth: '500px',
      margin: '20px auto',
      padding: '30px',
      backgroundColor: '#fff',
      borderRadius: '20px',
      boxShadow: '0 15px 35px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e0e0e0',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    },
    header: {
      fontSize: '28px',
      fontWeight: 'bold',
      textAlign: 'center' as const,
      marginBottom: '30px',
      color: '#2c3e50',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text'
    },
    statusBox: {
      marginBottom: '20px',
      padding: '12px 15px',
      backgroundColor: '#d4edda',
      border: '2px solid #28a745',
      borderRadius: '10px',
      color: '#155724',
      fontSize: '14px',
      textAlign: 'center' as const
    },
    errorBox: {
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#fee',
      border: '2px solid #ff6b6b',
      borderRadius: '10px',
      color: '#d63031',
      fontSize: '14px',
      textAlign: 'center' as const,
      wordBreak: 'break-word' as const
    },
    infoBox: {
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#e3f2fd',
      border: '2px solid #2196f3',
      borderRadius: '10px',
      color: '#1565c0',
      fontSize: '14px',
      textAlign: 'center' as const
    },
    successBox: {
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#d4edda',
      border: '2px solid #28a745',
      borderRadius: '10px',
      color: '#155724',
      fontSize: '14px',
      textAlign: 'center' as const
    },
    warningBox: {
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#fff3cd',
      border: '2px solid #ffc107',
      borderRadius: '10px',
      color: '#856404',
      fontSize: '14px',
      textAlign: 'center' as const
    },
    buttonPrimary: {
      width: '100%',
      backgroundColor: '#4834d4',
      color: 'white',
      fontWeight: 'bold',
      padding: '15px 20px',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 5px 15px rgba(72, 52, 212, 0.3)',
      marginBottom: '15px'
    } as React.CSSProperties,
    buttonSecondary: {
      width: '100%',
      backgroundColor: '#ff6b6b',
      color: 'white',
      fontWeight: 'bold',
      padding: '12px 20px',
      border: 'none',
      borderRadius: '10px',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      marginBottom: '10px'
    } as React.CSSProperties,
    buttonSuccess: {
      backgroundColor: '#00d2d3',
      color: 'white',
      fontWeight: 'bold',
      padding: '12px 20px',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    } as React.CSSProperties,
    buttonFile: {
      width: '100%',
      backgroundColor: '#ff9f43',
      color: 'white',
      fontWeight: 'bold',
      padding: '15px 20px',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 5px 15px rgba(255, 159, 67, 0.3)',
      marginBottom: '15px'
    } as React.CSSProperties,
    video: {
      width: '100%',
      height: '280px',
      backgroundColor: '#f8f9fa',
      borderRadius: '15px',
      objectFit: 'cover' as const,
      border: '3px solid #ddd',
      marginBottom: '15px'
    },
    divider: {
      borderTop: '2px solid #e9ecef',
      paddingTop: '20px',
      marginTop: '20px'
    },
    inputContainer: {
      display: 'flex',
      gap: '10px',
      marginTop: '10px'
    },
    input: {
      flex: '1',
      padding: '12px 15px',
      border: '2px solid #ddd',
      borderRadius: '10px',
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.3s ease'
    },
    textarea: {
      width: '100%',
      padding: '12px 15px',
      border: '2px solid #ddd',
      borderRadius: '10px',
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.3s ease',
      minHeight: '100px',
      marginBottom: '15px',
      resize: 'vertical' as const
    },
    hiddenInput: {
      display: 'none'
    },
    label: {
      fontSize: '14px',
      color: '#666',
      marginBottom: '8px',
      display: 'block'
    },
    resultBox: {
      marginTop: '25px',
      padding: '20px',
      backgroundColor: '#d4edda',
      border: '2px solid #28a745',
      borderRadius: '15px',
      color: '#155724',
      textAlign: 'center' as const
    },
    phoneNumber: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#28a745',
      margin: '10px 0'
    },
    scannerContainer: {
      marginBottom: '20px'
    },
    optionsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '15px',
      marginBottom: '20px'
    },
    processingBox: {
      padding: '15px',
      backgroundColor: '#fff3cd',
      border: '2px solid #ffc107',
      borderRadius: '10px',
      color: '#856404',
      fontSize: '14px',
      textAlign: 'center' as const,
      marginBottom: '15px'
    },
    scanningIndicator: {
      padding: '10px',
      backgroundColor: '#d1ecf1',
      border: '2px solid #bee5eb',
      borderRadius: '10px',
      color: '#0c5460',
      fontSize: '14px',
      textAlign: 'center' as const,
      marginBottom: '10px'
    },
    debugInfo: {
      marginTop: '15px',
      padding: '10px',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      fontSize: '12px',
      color: '#6c757d',
      wordBreak: 'break-word' as const
    },
    smsForm: {
      marginTop: '20px',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      borderRadius: '15px',
      border: '1px solid #dee2e6'
    },
    smsButton: {
      backgroundColor: '#20c997',
      color: 'white',
      fontWeight: 'bold',
      padding: '12px 20px',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      width: '100%'
    } as React.CSSProperties
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>📱 QR Phone Scanner</h2>
      
      <div style={styles.statusBox}>
        ✅ QR Scanner Ready {smsAttempted && '| SMS App Opened!'}
      </div>
      
      {error && (
        <div style={styles.errorBox}>
          ⚠️ {error}
        </div>
      )}

      {smsAttempted && !error && (
        <div style={styles.successBox}>
          📱 SMS app should have opened. Complete sending the message in your SMS app!
          {!isMobileDevice() && (
            <div style={{ marginTop: '10px', fontSize: '12px' }}>
              💡 For best results, use this on a mobile device.
            </div>
          )}
        </div>
      )}

      {isProcessingFile && (
        <div style={styles.processingBox}>
          🔄 Analyzing image for QR codes...
        </div>
      )}

      {isScanning && (
        <div style={styles.scanningIndicator}>
          🔍 Scanning for QR codes... Point camera at QR code containing phone number
        </div>
      )}

      {!scanned && (
        <div>
          {/* Permission handling */}
          {permissionState === 'unknown' || permissionState === 'prompt' ? (
            <div style={styles.infoBox}>
              📹 Camera access needed for live QR scanning
            </div>
          ) : permissionState === 'denied' ? (
            <div style={styles.errorBox}>
              🚫 Camera access denied. Use the file upload option or enable camera in browser settings.
            </div>
          ) : null}

          {/* Device compatibility warning */}
          {!isMobileDevice() && (
            <div style={styles.warningBox}>
              💡 You're on a desktop device. SMS functionality works best on mobile devices.
            </div>
          )}

          {/* Scanning options */}
          <div style={styles.optionsGrid}>
            {/* Camera Scanner Button */}
            {permissionState !== 'denied' && (
              <button
                style={styles.buttonPrimary}
                onClick={async () => {
                  if (permissionState === 'granted') {
                    await startScanning();
                  } else {
                    const granted = await requestCameraPermission();
                    if (granted) {
                      await startScanning();
                    }
                  }
                }}
                disabled={isScanning}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#3742fa';
                  target.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#4834d4';
                  target.style.transform = 'translateY(0px)';
                }}
              >
                📷 {isScanning ? 'Scanning...' : (permissionState === 'granted' ? 'Start Camera' : 'Allow Camera')}
              </button>
            )}

            {/* File Upload Button */}
            <button
              style={styles.buttonFile}
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              onMouseOver={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#ff8c00';
                target.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#ff9f43';
                target.style.transform = 'translateY(0px)';
              }}
            >
              📂 Upload QR Image
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={styles.hiddenInput}
          />

          {/* Active Camera View */}
          {isScanning && (
            <div style={styles.scannerContainer}>
              <video
                ref={videoRef}
                style={styles.video}
                playsInline
                muted
              />
              <button
                style={styles.buttonSecondary}
                onClick={stopScanning}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#ff5252';
                  target.style.transform = 'scale(0.98)';
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#ff6b6b';
                  target.style.transform = 'scale(1)';
                }}
              >
                ⏹️ Stop Camera
              </button>
            </div>
          )}

          {/* Manual Input */}
          <div style={styles.divider}>
            <label style={styles.label}>✋ Or enter phone number manually:</label>
            <div style={styles.inputContainer}>
              <input
                type="tel"
                placeholder="Enter phone number (e.g., +1234567890)"
                style={styles.input}
                onFocus={(e) => {
                  const target = e.target as HTMLInputElement;
                  target.style.borderColor = '#4834d4';
                  target.style.boxShadow = '0 0 0 3px rgba(72, 52, 212, 0.1)';
                }}
                onBlur={(e) => {
                  const target = e.target as HTMLInputElement;
                  target.style.borderColor = '#ddd';
                  target.style.boxShadow = 'none';
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement;
                    handleManualInput(target.value);
                  }
                }}
              />
              <button
                style={styles.buttonSuccess}
                onClick={(e) => {
                  const button = e.target as HTMLButtonElement;
                  const input = button.previousElementSibling as HTMLInputElement;
                  handleManualInput(input.value);
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#00a8cc';
                  target.style.transform = 'scale(1.05)';
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#00d2d3';
                  target.style.transform = 'scale(1)';
                }}
              >
                ✅ Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {phoneNumber && scanned && (
        <div style={styles.resultBox}>
          <p style={{ fontSize: '16px', marginBottom: '10px' }}>🎉 Phone Number Found:</p>
          <p style={styles.phoneNumber}>{phoneNumber}</p>
          
          {/* SMS Form */}
          <div style={styles.smsForm}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', textAlign: 'center' }}>✉️ Send SMS</h3>
            <form ref={smsFormRef} onSubmit={sendSms}>
              <div style={{ marginBottom: '15px' }}>
                <label style={styles.label}>Message:</label>
                <textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="Type your message here..."
                  style={styles.textarea}
                  required
                  onFocus={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.borderColor = '#4834d4';
                    target.style.boxShadow = '0 0 0 3px rgba(72, 52, 212, 0.1)';
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.borderColor = '#ddd';
                    target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              <button
                type="submit"
                style={styles.smsButton}
                disabled={isSendingSms}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#12b886';
                  target.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.backgroundColor = '#20c997';
                  target.style.transform = 'translateY(0px)';
                }}
              >
                {isSendingSms ? 'Opening SMS App...' : '📤 Open SMS App'}
              </button>
            </form>
            
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
              📌 This will open your device's SMS app with the message pre-filled. You'll need to press "Send" manually.
            </div>
          </div>
          
          {lastScannedContent && (
            <div style={styles.debugInfo}>
              <strong>Original QR Content:</strong> {lastScannedContent.substring(0, 200)}{lastScannedContent.length > 200 ? '...' : ''}
            </div>
          )}
          
          <button
            style={{
              ...styles.buttonPrimary,
              width: 'auto',
              padding: '10px 20px',
              fontSize: '14px',
              marginTop: '15px'
            }}
            onClick={resetScanner}
            onMouseOver={(e) => {
              const target = e.target as HTMLButtonElement;
              target.style.backgroundColor = '#3742fa';
            }}
            onMouseOut={(e) => {
              const target = e.target as HTMLButtonElement;
              target.style.backgroundColor = '#4834d4';
            }}
          >
            🔄 Scan Another
          </button>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default PhoneQrScanner;
