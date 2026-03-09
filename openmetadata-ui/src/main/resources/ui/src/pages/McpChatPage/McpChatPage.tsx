/*
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { AxiosError } from 'axios';
import { isEmpty } from 'lodash';
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as AddChatIcon } from '../../assets/svg/add-chat.svg';
import { ReactComponent as TrashIcon } from '../../assets/svg/ic-trash.svg';
import RichTextEditorPreviewerV1 from '../../components/common/RichTextEditor/RichTextEditorPreviewerV1';
import {
  ChatResponse,
  deleteConversation,
  listConversations,
  listMessages,
  McpConversation,
  McpMessage,
  MessageBlock,
  sendChatMessage,
  ToolCallInfo,
} from '../../rest/mcpClientAPI';
import { showErrorToast } from '../../utils/ToastUtils';

const McpChatPage = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<McpConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >();
  const [messages, setMessages] = useState<McpMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingConversations, setIsLoadingConversations] =
    useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const response = await listConversations();
      setConversations(response.data);
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setIsLoading(true);
    try {
      const response = await listMessages(conversationId);
      setMessages(response.data);
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
      fetchMessages(conversationId);
    },
    [fetchMessages]
  );

  const handleNewChat = useCallback(() => {
    setActiveConversationId(undefined);
    setMessages([]);
    setInputValue('');
  }, []);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversation(conversationId);
        setConversations((prev) =>
          prev.filter((c) => c.id !== conversationId)
        );
        if (activeConversationId === conversationId) {
          handleNewChat();
        }
      } catch (error) {
        showErrorToast(error as AxiosError);
      }
    },
    [activeConversationId, handleNewChat]
  );

  const handleSendMessage = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (isEmpty(trimmedInput) || isSending) {
      return;
    }

    const userMessage: McpMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId ?? '',
      sender: 'human',
      index: messages.length,
      timestamp: Date.now(),
      content: [
        {
          type: 'Generic',
          textMessage: { type: 'plain', message: trimmedInput },
        },
      ],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      const response: ChatResponse = await sendChatMessage({
        conversationId: activeConversationId,
        message: trimmedInput,
      });

      if (!activeConversationId) {
        setActiveConversationId(response.conversationId);
        fetchConversations();
      }

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== userMessage.id);

        const realUserMessage: McpMessage = {
          ...userMessage,
          conversationId: response.conversationId,
        };

        return [...filtered, realUserMessage, response.message];
      });
    } catch (error) {
      showErrorToast(error as AxiosError);
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsSending(false);
    }
  }, [
    inputValue,
    isSending,
    activeConversationId,
    messages.length,
    fetchConversations,
  ]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  return (
    <Box display="flex" height="100%" overflow="hidden">
      <ConversationSidebar
        activeConversationId={activeConversationId}
        conversations={conversations}
        isLoading={isLoadingConversations}
        onDelete={handleDeleteConversation}
        onNewChat={handleNewChat}
        onSelect={handleConversationSelect}
      />
      <Box
        display="flex"
        flex={1}
        flexDirection="column"
        overflow="hidden"
        sx={{ backgroundColor: theme.palette.background.default }}>
        {activeConversationId || !isEmpty(messages) ? (
          <>
            {activeConversation?.title && (
              <Box
                px={3}
                py={1.5}
                sx={{
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}>
                <Typography fontWeight={600} variant="subtitle1">
                  {activeConversation.title}
                </Typography>
              </Box>
            )}
            <MessageList
              isLoading={isLoading}
              messages={messages}
              messagesEndRef={messagesEndRef}
            />
            <ChatInput
              inputValue={inputValue}
              isSending={isSending}
              onKeyDown={handleKeyDown}
              onSend={handleSendMessage}
              onValueChange={setInputValue}
            />
          </>
        ) : (
          <Box
            alignItems="center"
            display="flex"
            flex={1}
            flexDirection="column"
            gap={2}
            justifyContent="center">
            <AddChatIcon height={48} width={48} />
            <Typography color="text.secondary" variant="body1">
              {t('message.mcp-chat-empty')}
            </Typography>
            <ChatInput
              inputValue={inputValue}
              isSending={isSending}
              onKeyDown={handleKeyDown}
              onSend={handleSendMessage}
              onValueChange={setInputValue}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

interface ConversationSidebarProps {
  conversations: McpConversation[];
  activeConversationId: string | undefined;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

const ConversationSidebar = ({
  conversations,
  activeConversationId,
  isLoading,
  onSelect,
  onNewChat,
  onDelete,
}: ConversationSidebarProps) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{
        width: 280,
        minWidth: 280,
        borderRight: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}>
      <Box
        alignItems="center"
        display="flex"
        justifyContent="space-between"
        px={2}
        py={1.5}>
        <Typography fontWeight={600} variant="subtitle1">
          {t('label.mcp-chat')}
        </Typography>
        <Tooltip title={t('label.new-chat')}>
          <IconButton
            data-testid="new-chat-button"
            size="small"
            onClick={onNewChat}>
            <AddChatIcon height={20} width={20} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />
      <Box flex={1} overflow="auto">
        {isLoading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List disablePadding>
            {conversations.map((conversation) => (
              <ListItemButton
                data-testid={`conversation-item-${conversation.id}`}
                key={conversation.id}
                selected={conversation.id === activeConversationId}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.action.selected,
                  },
                }}
                onClick={() => onSelect(conversation.id)}>
                <ListItemText
                  primary={
                    conversation.title ??
                    `${t('label.conversation')} ${conversation.id.slice(0, 8)}`
                  }
                  primaryTypographyProps={{
                    noWrap: true,
                    variant: 'body2',
                  }}
                  secondary={`${conversation.messageCount} ${t('label.message-lowercase-plural')}`}
                  secondaryTypographyProps={{
                    variant: 'caption',
                  }}
                />
                <Tooltip title={t('label.delete')}>
                  <IconButton
                    data-testid={`delete-conversation-${conversation.id}`}
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conversation.id);
                    }}>
                    <TrashIcon height={14} width={14} />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

interface MessageListProps {
  messages: McpMessage[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const MessageList = ({
  messages,
  isLoading,
  messagesEndRef,
}: MessageListProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Box
        alignItems="center"
        display="flex"
        flex={1}
        justifyContent="center">
        <CircularProgress />
      </Box>
    );
  }

  if (isEmpty(messages)) {
    return (
      <Box
        alignItems="center"
        display="flex"
        flex={1}
        justifyContent="center">
        <Typography color="text.secondary" variant="body2">
          {t('message.mcp-chat-empty')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box flex={1} overflow="auto" px={3} py={2}>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </Box>
  );
};

interface MessageBubbleProps {
  message: McpMessage;
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isHuman = message.sender === 'human';

  const textContent = useMemo(() => {
    if (!message.content) {
      return '';
    }

    return message.content
      .filter((block: MessageBlock) => block.textMessage)
      .map((block: MessageBlock) => block.textMessage?.message ?? '')
      .join('\n');
  }, [message.content]);

  const toolCalls = useMemo(() => {
    if (!message.content) {
      return [];
    }

    return message.content
      .filter((block: MessageBlock) => !isEmpty(block.tools))
      .flatMap((block: MessageBlock) => block.tools ?? []);
  }, [message.content]);

  const isMarkdown = useMemo(() => {
    if (!message.content) {
      return false;
    }

    return message.content.some(
      (block: MessageBlock) => block.textMessage?.type === 'markdown'
    );
  }, [message.content]);

  return (
    <Box
      display="flex"
      justifyContent={isHuman ? 'flex-end' : 'flex-start'}
      mb={2}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: '70%',
          px: 2,
          py: 1.5,
          borderRadius: 2,
          backgroundColor: isHuman
            ? theme.palette.primary.main
            : theme.palette.grey[100],
          color: isHuman
            ? theme.palette.primary.contrastText
            : theme.palette.text.primary,
        }}>
        {!isEmpty(textContent) &&
          (isMarkdown && !isHuman ? (
            <RichTextEditorPreviewerV1
              enableSeeMoreVariant={false}
              markdown={textContent}
            />
          ) : (
            <Typography
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              variant="body2">
              {textContent}
            </Typography>
          ))}
        {!isEmpty(toolCalls) && (
          <Box mt={1}>
            {toolCalls.map((tool: ToolCallInfo, index: number) => (
              <ToolCallDisplay key={`${tool.name}-${index}`} tool={tool} />
            ))}
          </Box>
        )}
        {message.tokens && (
          <Typography
            color={isHuman ? 'inherit' : 'text.secondary'}
            mt={0.5}
            sx={{ opacity: 0.7 }}
            variant="caption">
            {message.tokens.totalTokens
              ? `${message.tokens.totalTokens} ${t('label.token-plural')}`
              : ''}
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

interface ToolCallDisplayProps {
  tool: ToolCallInfo;
}

const ToolCallDisplay = ({ tool }: ToolCallDisplayProps) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        backgroundColor: theme.palette.grey[50],
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        mb: 0.5,
        '&:before': { display: 'none' },
      }}>
      <AccordionSummary
        sx={{
          minHeight: 32,
          '& .MuiAccordionSummary-content': { margin: '4px 0' },
        }}>
        <Typography color="text.secondary" variant="caption">
          {tool.name}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {tool.input && (
          <Box mb={1}>
            <Typography
              color="text.secondary"
              sx={{ fontWeight: 600 }}
              variant="caption">
              {t('label.input')}
            </Typography>
            <Box
              component="pre"
              sx={{
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 200,
                backgroundColor: theme.palette.grey[100],
                borderRadius: 1,
                p: 1,
                m: 0,
              }}>
              {JSON.stringify(tool.input, null, 2)}
            </Box>
          </Box>
        )}
        {tool.result && (
          <Box>
            <Typography
              color="text.secondary"
              sx={{ fontWeight: 600 }}
              variant="caption">
              {t('label.result')}
            </Typography>
            <Box
              component="pre"
              sx={{
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 200,
                backgroundColor: theme.palette.grey[100],
                borderRadius: 1,
                p: 1,
                m: 0,
              }}>
              {JSON.stringify(tool.result, null, 2)}
            </Box>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

interface ChatInputProps {
  inputValue: string;
  isSending: boolean;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

const ChatInput = ({
  inputValue,
  isSending,
  onValueChange,
  onSend,
  onKeyDown,
}: ChatInputProps) => {
  const { t } = useTranslation();

  return (
    <Box
      alignItems="flex-end"
      display="flex"
      gap={1}
      p={2}
      sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
      <TextField
        fullWidth
        multiline
        data-testid="mcp-chat-input"
        disabled={isSending}
        maxRows={4}
        placeholder={t('message.mcp-chat-placeholder')}
        size="small"
        value={inputValue}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button
        data-testid="mcp-send-button"
        disabled={isEmpty(inputValue.trim()) || isSending}
        size="small"
        variant="contained"
        onClick={onSend}>
        {isSending ? (
          <CircularProgress color="inherit" size={20} />
        ) : (
          t('label.send')
        )}
      </Button>
    </Box>
  );
};

export default McpChatPage;
